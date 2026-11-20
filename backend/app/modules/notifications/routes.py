"""Notification and push-device routes.

Customer: GET /customer/notifications, PATCH /customer/notifications/{id}/read, POST /customer/devices
Store:    GET /store/notifications,    PATCH /store/notifications/{id}/read,    POST /store/devices
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from app.api.dependencies import get_db, get_settings, require_customer, require_store_staff
from app.core.config import Settings
from app.core.security import AuthUser
from app.modules.notifications.push import DeviceTokenRepository, FcmPushSender, NoopPushSender, PushDispatcher, PushSender
from app.modules.notifications.service import NotificationService
from app.shared.pagination import PageParams, page_params
from app.shared.schemas import ok

customer_router = APIRouter(prefix="/customer", tags=["customer: notifications"])
store_router = APIRouter(prefix="/store", tags=["store: notifications"])


def get_push_sender(request: Request, settings: Settings = Depends(get_settings)) -> PushSender:
    """The push sender: whatever the app was started with (tests), else FCM when enabled, else a no-op."""
    sender = getattr(request.app.state, "push_sender", None)
    if sender is None:
        sender = FcmPushSender() if settings.fcm_enabled else NoopPushSender()
        request.app.state.push_sender = sender
    return sender


def get_push_dispatcher(db: Any = Depends(get_db), sender: PushSender = Depends(get_push_sender)) -> PushDispatcher:
    return PushDispatcher(db, sender)


def get_notification_service(db: Any = Depends(get_db)) -> NotificationService:
    return NotificationService(db)


class DeviceRegistration(BaseModel):
    """A push token from the browser/phone (FCM registration token)."""

    token: str = Field(min_length=20, max_length=4096)


@customer_router.get("/notifications")
async def customer_notifications(
    page: PageParams = Depends(page_params),
    user: AuthUser = Depends(require_customer),
    service: NotificationService = Depends(get_notification_service),
) -> dict:
    """The caller's notifications, newest first."""
    items, pagination = await service.list_for_customer(user.uid, page)
    return ok(items, pagination)


@customer_router.patch("/notifications/{notification_id}/read")
async def customer_mark_read(
    notification_id: str,
    user: AuthUser = Depends(require_customer),
    service: NotificationService = Depends(get_notification_service),
) -> dict:
    return ok(await service.mark_read(notification_id, user_id=user.uid))


@customer_router.post("/devices", status_code=201)
async def customer_register_device(
    body: DeviceRegistration, user: AuthUser = Depends(require_customer), db: Any = Depends(get_db)
) -> dict:
    """Register this device for push notifications."""
    await DeviceTokenRepository(db).register(body.token, user.uid, None)
    return ok({"registered": True})


@store_router.get("/notifications")
async def store_notifications(
    page: PageParams = Depends(page_params),
    user: AuthUser = Depends(require_store_staff),
    service: NotificationService = Depends(get_notification_service),
) -> dict:
    """Notifications for the caller's store, newest first."""
    items, pagination = await service.list_for_store(user.store_id or "", page)
    return ok(items, pagination)


@store_router.patch("/notifications/{notification_id}/read")
async def store_mark_read(
    notification_id: str,
    user: AuthUser = Depends(require_store_staff),
    service: NotificationService = Depends(get_notification_service),
) -> dict:
    return ok(await service.mark_read(notification_id, store_id=user.store_id or ""))


@store_router.post("/devices", status_code=201)
async def store_register_device(
    body: DeviceRegistration, user: AuthUser = Depends(require_store_staff), db: Any = Depends(get_db)
) -> dict:
    """Register this device so new orders and arrivals reach the counter's phone."""
    await DeviceTokenRepository(db).register(body.token, user.uid, user.store_id)
    return ok({"registered": True})
