"""Cursor pagination shared by every list endpoint (cursor = last document id)."""

from __future__ import annotations

from fastapi import Query
from pydantic import BaseModel, Field


class PageParams(BaseModel):
    """Incoming pagination parameters."""

    limit: int = Field(default=20, ge=1, le=100)
    cursor: str | None = None


class Pagination(BaseModel):
    """Pagination block returned in the response envelope."""

    limit: int
    next_cursor: str | None = None
    has_more: bool = False


def page_params(
    limit: int = Query(20, ge=1, le=100), cursor: str | None = Query(None, max_length=200)
) -> PageParams:
    """FastAPI dependency producing ``PageParams`` from ``?limit=&cursor=``."""
    return PageParams(limit=limit, cursor=cursor)
