"""Base repository: the ONLY layer allowed to touch Firestore collections.

Firestore conventions enforced here: money is stored as a string, enums as their
string value, datetimes as timezone-aware UTC. Subclasses add collection-specific queries.
"""

from __future__ import annotations

from decimal import Decimal
from enum import Enum
from typing import Any, Generic, TypeVar

from google.api_core.exceptions import AlreadyExists
from google.cloud.firestore_v1.base_query import FieldFilter
from pydantic import BaseModel

from app.core.exceptions import ConflictError, NotFoundError
from app.shared.pagination import PageParams, Pagination

M = TypeVar("M", bound=BaseModel)

__all__ = ["BaseRepository", "FieldFilter", "serialize"]


def serialize(value: Any) -> Any:
    """Convert models/Decimals/enums to Firestore-storable primitives (recursive)."""
    if isinstance(value, BaseModel):
        return serialize(value.model_dump(mode="python"))
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, dict):
        return {k: serialize(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set, frozenset)):
        return [serialize(v) for v in value]
    return value


class BaseRepository(Generic[M]):
    """Generic async CRUD + cursor pagination over one Firestore collection."""

    collection_name: str
    model: type[M]

    def __init__(self, db: Any) -> None:
        self._db = db

    @property
    def collection(self) -> Any:
        """The Firestore collection reference."""
        return self._db.collection(self.collection_name)

    def ref(self, doc_id: str) -> Any:
        """Document reference (used when joining a caller-owned transaction)."""
        return self.collection.document(doc_id)

    def decode(self, data: dict[str, Any]) -> M:
        """Build a domain model from a stored document."""
        return self.model.model_validate(data)

    async def get(self, doc_id: str) -> M | None:
        """Fetch one document or ``None``."""
        snap = await self.ref(doc_id).get()
        return self.decode(snap.to_dict()) if snap.exists else None

    async def get_or_raise(self, doc_id: str, message: str | None = None) -> M:
        """Fetch one document or raise ``NotFoundError``."""
        found = await self.get(doc_id)
        if found is None:
            raise NotFoundError(message or f"{self.collection_name} document not found")
        return found

    async def create(self, doc_id: str, model: M) -> M:
        """Create a document; raises ``ConflictError`` if it already exists."""
        try:
            await self.ref(doc_id).create(serialize(model))
        except AlreadyExists as exc:
            raise ConflictError(f"{self.collection_name} document already exists") from exc
        return model

    async def set(self, doc_id: str, model: M) -> M:
        """Create or fully replace a document."""
        await self.ref(doc_id).set(serialize(model))
        return model

    async def update(self, doc_id: str, fields: dict[str, Any]) -> None:
        """Partially update a document (top-level fields only)."""
        await self.ref(doc_id).update(serialize(fields))

    async def delete(self, doc_id: str) -> None:
        """Delete a document."""
        await self.ref(doc_id).delete()

    async def page(
        self, query: Any, order_field: str, page: PageParams, descending: bool = False
    ) -> tuple[list[M], Pagination]:
        """Execute ``query`` ordered by ``order_field`` with cursor (last doc id) pagination."""
        direction = "DESCENDING" if descending else "ASCENDING"
        query = query.order_by(order_field, direction=direction)
        if page.cursor:
            cursor_snap = await self.ref(page.cursor).get()
            if not cursor_snap.exists:
                raise NotFoundError("Invalid pagination cursor", code="invalid_cursor")
            query = query.start_after(cursor_snap)
        snaps = await query.limit(page.limit + 1).get()
        has_more = len(snaps) > page.limit
        snaps = snaps[: page.limit]
        items = [self.decode(s.to_dict()) for s in snaps]
        next_cursor = snaps[-1].id if has_more and snaps else None
        return items, Pagination(limit=page.limit, next_cursor=next_cursor, has_more=has_more)
