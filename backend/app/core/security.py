"""Authentication primitives: Firebase ID token verification and the ``AuthUser`` principal.

Role and store membership are read ONLY from verified token custom claims
(``role``, ``store_id``) that are set server-side via ``scripts/set_role.py``.
Nothing the client sends in a body, query or header is ever trusted for these.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any, Protocol

from app.core.config import Settings
from app.core.exceptions import UnauthorizedError
from app.shared.enums import Role

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AuthUser:
    """The authenticated caller, derived exclusively from a verified token."""

    uid: str
    role: Role
    store_id: str | None = None
    email: str | None = None
    name: str | None = None

    @classmethod
    def from_claims(cls, claims: dict[str, Any]) -> "AuthUser":
        """Build a principal from decoded token claims (unknown roles degrade to CUSTOMER)."""
        uid = claims.get("uid") or claims.get("sub") or claims.get("user_id")
        if not uid:
            raise UnauthorizedError("Token has no subject")
        try:
            role = Role(claims.get("role", Role.CUSTOMER.value))
        except ValueError:
            role = Role.CUSTOMER
        store_id = claims.get("store_id") if role in (Role.STORE_STAFF, Role.STORE_MANAGER) else None
        return cls(
            uid=str(uid),
            role=role,
            store_id=str(store_id) if store_id else None,
            email=claims.get("email"),
            name=claims.get("name"),
        )


class TokenVerifier(Protocol):
    """Anything that can turn a bearer token into verified claims."""

    async def verify(self, token: str) -> dict[str, Any]:
        """Return decoded claims or raise ``UnauthorizedError``."""
        ...


class FirebaseTokenVerifier:
    """Verifies Firebase ID tokens with the Firebase Admin SDK."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def verify(self, token: str) -> dict[str, Any]:
        """Verify signature, expiry, audience and issuer; raise ``UnauthorizedError`` on failure."""
        from firebase_admin import auth

        try:
            # The SDK call is blocking (it may fetch public keys), so run it in a thread.
            return await asyncio.to_thread(auth.verify_id_token, token)
        except Exception as exc:  # noqa: BLE001 - SDK raises several unrelated types
            logger.info("token_verification_failed", extra={"fields": {"reason": type(exc).__name__}})
            raise UnauthorizedError("Invalid or expired token") from exc
