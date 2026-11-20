"""Minimal in-memory async Firestore fake used by the test-suite (no credentials needed).

Faithful where it matters for our logic: documents are copied on read/write, ``create`` and
``update`` raise the same exceptions as the real client, queries support ==/in/range filters,
ordering, limit and ``start_after``, values that Firestore cannot store (Decimal, Enum,
pydantic models) are REJECTED, and transactions queue writes and apply them atomically on
success. ``run_transaction`` serialises transactions with a lock, which models the outcome of
Firestore's optimistic retry (it does not model contention itself).
"""

from __future__ import annotations

import asyncio
import copy
import uuid
from decimal import Decimal
from enum import Enum
from typing import Any, Awaitable, Callable

from google.api_core.exceptions import AlreadyExists, NotFound
from pydantic import BaseModel


def _check_storable(value: Any, path: str = "") -> None:
    if isinstance(value, (Decimal, Enum, BaseModel)):
        raise TypeError(f"Value at '{path}' is not Firestore-storable: {type(value).__name__}")
    if isinstance(value, dict):
        for k, v in value.items():
            _check_storable(v, f"{path}.{k}")
    elif isinstance(value, (list, tuple)):
        for i, v in enumerate(value):
            _check_storable(v, f"{path}[{i}]")


class FakeSnapshot:
    """Document snapshot."""

    def __init__(self, ref: "FakeDocumentReference", data: dict[str, Any] | None) -> None:
        self.reference = ref
        self.id = ref.id
        self._data = data

    @property
    def exists(self) -> bool:
        return self._data is not None

    def to_dict(self) -> dict[str, Any] | None:
        return copy.deepcopy(self._data) if self._data is not None else None


class FakeDocumentReference:
    """Document reference."""

    def __init__(self, db: "FakeFirestore", collection_path: str, doc_id: str) -> None:
        self._db = db
        self._cpath = collection_path
        self.id = doc_id

    @property
    def path(self) -> str:
        return f"{self._cpath}/{self.id}"

    def collection(self, name: str) -> "FakeCollection":
        return FakeCollection(self._db, f"{self.path}/{name}")

    async def get(self, transaction: Any = None) -> FakeSnapshot:
        return FakeSnapshot(self, self._db._read(self._cpath, self.id))

    async def set(self, data: dict[str, Any]) -> None:
        self._db._apply("set", self, data)

    async def create(self, data: dict[str, Any]) -> None:
        self._db._apply("create", self, data)

    async def update(self, data: dict[str, Any]) -> None:
        self._db._apply("update", self, data)

    async def delete(self) -> None:
        self._db._apply("delete", self, None)


class FakeQuery:
    """Query over one collection."""

    def __init__(self, db: "FakeFirestore", path: str) -> None:
        self._db = db
        self._path = path
        self._filters: list[tuple[str, str, Any]] = []
        self._order: tuple[str, bool] | None = None
        self._limit: int | None = None
        self._start_after: FakeSnapshot | None = None

    def _clone(self) -> "FakeQuery":
        q = FakeQuery(self._db, self._path)
        q._filters = list(self._filters)
        q._order, q._limit, q._start_after = self._order, self._limit, self._start_after
        return q

    def where(self, *args: Any, filter: Any = None) -> "FakeQuery":  # noqa: A002 - mirrors real API
        q = self._clone()
        if filter is not None:
            q._filters.append((filter.field_path, filter.op_string, filter.value))
        else:
            q._filters.append(args)  # type: ignore[arg-type]
        return q

    def order_by(self, field: str, direction: str = "ASCENDING") -> "FakeQuery":
        q = self._clone()
        q._order = (field, direction == "DESCENDING")
        return q

    def limit(self, n: int) -> "FakeQuery":
        q = self._clone()
        q._limit = n
        return q

    def start_after(self, snapshot: FakeSnapshot) -> "FakeQuery":
        q = self._clone()
        q._start_after = snapshot
        return q

    @staticmethod
    def _match(value: Any, op: str, target: Any) -> bool:
        if op == "==":
            return value == target
        if op == "in":
            return value in target
        if value is None:
            return False
        return {"<": value < target, "<=": value <= target, ">": value > target, ">=": value >= target}[op]

    async def get(self, transaction: Any = None) -> list[FakeSnapshot]:
        docs = self._db._collection(self._path)
        rows = [
            (doc_id, data)
            for doc_id, data in docs.items()
            if all(self._match(data.get(f), op, v) for f, op, v in self._filters)
        ]
        if self._order:
            field, desc = self._order
            rows.sort(key=lambda r: (r[1].get(field), r[0]), reverse=desc)
        else:
            rows.sort(key=lambda r: r[0])
        if self._start_after is not None:
            ids = [r[0] for r in rows]
            if self._start_after.id in ids:
                rows = rows[ids.index(self._start_after.id) + 1 :]
        if self._limit is not None:
            rows = rows[: self._limit]
        return [FakeSnapshot(FakeDocumentReference(self._db, self._path, i), copy.deepcopy(d)) for i, d in rows]


class FakeCollection(FakeQuery):
    """Collection reference (a query that can also hand out documents)."""

    def document(self, doc_id: str | None = None) -> FakeDocumentReference:
        return FakeDocumentReference(self._db, self._path, doc_id or uuid.uuid4().hex)


class FakeTransaction:
    """Queues writes; applied atomically by ``FakeFirestore.run_transaction``."""

    def __init__(self) -> None:
        self.ops: list[tuple[str, FakeDocumentReference, dict[str, Any] | None]] = []

    def set(self, ref: FakeDocumentReference, data: dict[str, Any]) -> None:
        self.ops.append(("set", ref, data))

    def create(self, ref: FakeDocumentReference, data: dict[str, Any]) -> None:
        self.ops.append(("create", ref, data))

    def update(self, ref: FakeDocumentReference, data: dict[str, Any]) -> None:
        self.ops.append(("update", ref, data))

    def delete(self, ref: FakeDocumentReference) -> None:
        self.ops.append(("delete", ref, None))


class FakeFirestore:
    """In-memory database. ``is_fake`` lets tests assert they never hit the real client."""

    is_fake = True

    def __init__(self) -> None:
        self._store: dict[str, dict[str, dict[str, Any]]] = {}
        self._lock = asyncio.Lock()
        self.transactions_committed = 0

    # --- internal helpers ---------------------------------------------------
    def _collection(self, path: str) -> dict[str, dict[str, Any]]:
        return self._store.setdefault(path, {})

    def _read(self, path: str, doc_id: str) -> dict[str, Any] | None:
        return self._store.get(path, {}).get(doc_id)

    def _apply(self, op: str, ref: FakeDocumentReference, data: dict[str, Any] | None) -> None:
        docs = self._collection(ref._cpath)
        if data is not None:
            _check_storable(data, ref.path)
        if op == "create":
            if ref.id in docs:
                raise AlreadyExists(f"{ref.path} already exists")
            docs[ref.id] = copy.deepcopy(data)
        elif op == "set":
            docs[ref.id] = copy.deepcopy(data)
        elif op == "update":
            if ref.id not in docs:
                raise NotFound(f"{ref.path} not found")
            docs[ref.id] = {**docs[ref.id], **copy.deepcopy(data)}
        elif op == "delete":
            docs.pop(ref.id, None)

    # --- public API mirroring google.cloud.firestore.AsyncClient ------------
    def collection(self, name: str) -> FakeCollection:
        return FakeCollection(self, name)

    def transaction(self) -> FakeTransaction:
        return FakeTransaction()

    async def run_transaction(self, callback: Callable[[FakeTransaction], Awaitable[Any]]) -> Any:
        """Run ``callback`` under a lock; commit queued writes only if it returns normally."""
        async with self._lock:
            tx = FakeTransaction()
            result = await callback(tx)
            snapshot = copy.deepcopy(self._store)
            try:
                for op, ref, data in tx.ops:
                    self._apply(op, ref, data)
            except Exception:
                self._store = snapshot  # atomic: all or nothing
                raise
            self.transactions_committed += 1
            return result

    # --- test conveniences -----------------------------------------------------
    def docs(self, path: str) -> dict[str, dict[str, Any]]:
        """Raw documents of a collection path (deep-copied)."""
        return copy.deepcopy(self._store.get(path, {}))

    def put(self, path: str, doc_id: str, data: dict[str, Any]) -> None:
        """Insert a raw document."""
        _check_storable(data, f"{path}/{doc_id}")
        self._collection(path)[doc_id] = copy.deepcopy(data)
