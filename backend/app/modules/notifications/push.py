"""Push delivery (Firebase Cloud Messaging) with a no-op default.

Device tokens live in ``device_tokens``. After an order change commits, ``PushDispatcher`` looks up the
tokens of each notification's audience (a customer, or every device registered by a store) and sends.
Delivery is strictly best effort: a push failure must never fail an order operation.

NOT VERIFIED against real FCM in this repo (needs a Firebase project with messaging enabled).
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
from typing import Any, Protocol

from app.shared.models import DeviceToken, Notification, utc_now
from app.shared.repository import BaseRepository, FieldFilter

logger = logging.getLogger("quickpick.push")


class PushSender(Protocol):
    """Sends one message to many device tokens."""

    async def send(self, tokens: list[str], title: str, body: str, data: dict[str, str]) -> None: ...


class NoopPushSender:
    """Used when FCM is disabled (default): in-app notifications still work through polling."""

    async def send(self, tokens: list[str], title: str, body: str, data: dict[str, str]) -> None:
        return None


class FcmPushSender:
    """firebase-admin messaging. Imported lazily so the dependency is only touched when enabled."""

    async def send(self, tokens: list[str], title: str, body: str, data: dict[str, str]) -> None:
        if not tokens:
            return
        from firebase_admin import messaging

        message = messaging.MulticastMessage(
            tokens=tokens, notification=messaging.Notification(title=title, body=body), data=data
        )
        # firebase-admin's messaging client is blocking: keep it off the event loop.
        await asyncio.to_thread(messaging.send_each_for_multicast, message)


class DeviceTokenRepository(BaseRepository[DeviceToken]):
    """``device_tokens/{sha256(token)}``."""

    collection_name = "device_tokens"
    model = DeviceToken

    async def register(self, token: str, user_id: str, store_id: str | None) -> DeviceToken:
        doc_id = hashlib.sha256(token.encode()).hexdigest()[:40]
        model = DeviceToken(id=doc_id, token=token, user_id=user_id, store_id=store_id, created_at=utc_now())
        await self.set(doc_id, model)
        return model

    async def for_user(self, user_id: str) -> list[str]:
        snaps = await self.collection.where(filter=FieldFilter("user_id", "==", user_id)).limit(20).get()
        return [s.to_dict()["token"] for s in snaps]

    async def for_store(self, store_id: str) -> list[str]:
        snaps = await self.collection.where(filter=FieldFilter("store_id", "==", store_id)).limit(50).get()
        return [s.to_dict()["token"] for s in snaps]


class PushDispatcher:
    """Turns committed notifications into pushes. Never raises."""

    def __init__(self, db: Any, sender: PushSender | None = None) -> None:
        self._tokens = DeviceTokenRepository(db)
        self._sender: PushSender = sender or NoopPushSender()

    async def dispatch(self, notifications: list[Notification]) -> None:
        for n in notifications:
            try:
                tokens = await (self._tokens.for_user(n.user_id) if n.user_id else self._tokens.for_store(n.store_id or ""))
                if tokens:
                    data = {"kind": n.kind.value, "order_id": n.order_id or "", "notification_id": n.id}
                    await self._sender.send(tokens, n.title, n.body, data)
            except Exception:  # noqa: BLE001 - push is best effort by design
                logger.warning("push_failed", extra={"fields": {"notification_id": n.id}}, exc_info=True)
