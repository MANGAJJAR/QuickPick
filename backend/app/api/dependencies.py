"""Shared FastAPI dependencies: settings, database, authentication and role/store authorization.

Module-specific service factories live in each module's own ``deps.py`` so the two
developers never edit this file concurrently.
"""

from __future__ import annotations

from typing import Any, Callable

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import Settings
from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.core.security import AuthUser
from app.shared.enums import Role

_bearer = HTTPBearer(auto_error=False)


def get_settings(request: Request) -> Settings:
    """Settings attached to the running application."""
    return request.app.state.settings


def get_db(request: Request) -> Any:
    """The process-wide async Firestore client."""
    return request.app.state.db


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> AuthUser:
    """Verify the bearer ID token and return the authenticated principal."""
    if credentials is None or not credentials.credentials:
        raise UnauthorizedError("Missing bearer token")
    claims = await request.app.state.token_verifier.verify(credentials.credentials)
    return AuthUser.from_claims(claims)


def require_roles(*roles: Role) -> Callable[..., AuthUser]:
    """Dependency factory: allow only the given roles."""

    async def _dependency(user: AuthUser = Depends(get_current_user)) -> AuthUser:
        if user.role not in roles:
            raise ForbiddenError("Your role is not allowed to perform this action")
        return user

    return _dependency


def require_store_user(*roles: Role) -> Callable[..., AuthUser]:
    """Dependency factory for store endpoints.

    Allows the given store roles (default: staff and manager) and guarantees the
    token carries a ``store_id`` claim. Services scope every query to that
    ``store_id``, which is how cross-store access is prevented.
    """
    allowed = roles or (Role.STORE_STAFF, Role.STORE_MANAGER)

    async def _dependency(user: AuthUser = Depends(get_current_user)) -> AuthUser:
        if user.role not in allowed:
            raise ForbiddenError("Your role is not allowed to perform this action")
        if not user.store_id:
            raise ForbiddenError("No store is assigned to this account", code="store_claim_missing")
        return user

    return _dependency


require_customer = require_roles(Role.CUSTOMER)
require_store_staff = require_store_user(Role.STORE_STAFF, Role.STORE_MANAGER)
require_store_manager = require_store_user(Role.STORE_MANAGER)
