"""Customer profile schemas. OWNER: Developer 1."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ProfileUpdate(BaseModel):
    """Fields a customer may change. Role/uid/email are never client-editable."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    phone: str | None = Field(default=None, pattern=r"^\+?[0-9]{7,15}$")
