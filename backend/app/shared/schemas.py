"""Shared API schemas: the response envelope used by every endpoint."""

from __future__ import annotations

from typing import Any

from pydantic_core import to_jsonable_python

from app.shared.pagination import Pagination


def ok(data: Any = None, pagination: Pagination | None = None) -> dict[str, Any]:
    """Wrap a payload in the standard success envelope.

    Uses pydantic's JSON conversion so ``Decimal`` becomes a string (never a float)
    and datetimes become ISO-8601 strings.
    """
    body: dict[str, Any] = {
        "success": True,
        "data": to_jsonable_python(data),
        "error": None,
    }
    if pagination is not None:
        body["pagination"] = pagination.model_dump()
    return body
