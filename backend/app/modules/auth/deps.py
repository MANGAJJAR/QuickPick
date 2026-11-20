"""Service factory for the auth/user module."""

from __future__ import annotations

from typing import Any

from fastapi import Depends

from app.api.dependencies import get_db
from app.modules.auth.service import UserService


def get_user_service(db: Any = Depends(get_db)) -> UserService:
    """Build the ``UserService`` for the current request."""
    return UserService(db)
