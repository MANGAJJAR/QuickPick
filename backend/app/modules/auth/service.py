"""User profile provisioning from verified auth data."""

from __future__ import annotations

from typing import Any

from app.core.exceptions import ConflictError
from app.core.security import AuthUser
from app.modules.auth.repository import UserRepository
from app.shared.models import User, utc_now


class UserService:
    """Creates/reads ``users`` documents. Role always comes from the token, never the client."""

    def __init__(self, db: Any) -> None:
        self._users = UserRepository(db)

    async def get_or_create(self, auth: AuthUser) -> User:
        """Return the caller's profile, creating it from token claims on first use.

        The stored ``role`` is refreshed from the token claim so it cannot drift
        from what the Admin SDK granted.
        """
        existing = await self._users.get(auth.uid)
        if existing is not None:
            if existing.role != auth.role:
                await self._users.update(auth.uid, {"role": auth.role, "updated_at": utc_now()})
                existing = existing.model_copy(update={"role": auth.role})
            return existing
        now = utc_now()
        user = User(
            uid=auth.uid,
            name=auth.name or (auth.email.split("@")[0] if auth.email else "QuickPick User"),
            email=auth.email,
            role=auth.role,
            created_at=now,
            updated_at=now,
        )
        try:
            return await self._users.create(auth.uid, user)
        except ConflictError:  # a concurrent first request created it
            return await self._users.get_or_raise(auth.uid)

    async def update_profile(self, auth: AuthUser, fields: dict[str, Any]) -> User:
        """Update allowed profile fields (name, phone) for the caller only."""
        await self.get_or_create(auth)
        if fields:
            await self._users.update(auth.uid, {**fields, "updated_at": utc_now()})
        return await self._users.get_or_raise(auth.uid)
