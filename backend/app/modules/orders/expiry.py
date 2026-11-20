"""Auto-expiry of orders nobody acts on, so reserved stock never stays stuck.

* PLACED for ``placed_expiry_minutes``: the store never accepted it.
* READY_FOR_PICKUP for ``ready_expiry_minutes``: the customer never collected it.

Each order goes through ``OrderLifecycleService.transition(EXPIRED)``, so the stock release, the status
history, the customer/store notifications and the push all commit atomically. ``only_from`` makes a
race harmless: if the order moved on (accepted, collected, cancelled) between the query and the
transaction, it is skipped, never expired by mistake. Safe to run from many instances at once.
"""

from __future__ import annotations

import asyncio
import hmac
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Callable

from fastapi import APIRouter, Depends, Header

from app.api.dependencies import get_db, get_settings
from app.core.config import Settings
from app.core.exceptions import ForbiddenError, InvalidTransitionError, NotFoundError
from app.modules.notifications.push import PushDispatcher
from app.modules.notifications.routes import get_push_dispatcher
from app.modules.orders.lifecycle import OrderLifecycleService, OrderScope
from app.shared.enums import OrderStatus
from app.shared.models import utc_now
from app.shared.repository import FieldFilter
from app.shared.schemas import ok

logger = logging.getLogger("quickpick.expiry")

SYSTEM_ACTOR = "system:expiry"


@dataclass
class SweepResult:
    """What one sweep did."""

    expired: list[str] = field(default_factory=list)
    skipped: int = 0  # moved on between the query and the transaction (harmless)


class ExpiryService:
    """Finds overdue orders and expires them."""

    def __init__(
        self, db: Any, settings: Settings, *, push: PushDispatcher | None = None,
        clock: Callable[[], datetime] = utc_now, batch: int = 200,
    ) -> None:
        self._db = db
        self._settings = settings
        self._clock = clock
        self._batch = batch
        self._lifecycle = OrderLifecycleService(db, ready_expiry_minutes=settings.ready_expiry_minutes, push=push)

    async def _overdue(self, status: OrderStatus, time_field: str, minutes: int) -> list[str]:
        cutoff = self._clock() - timedelta(minutes=minutes)
        snaps = await (
            self._db.collection("orders")
            .where(filter=FieldFilter("order_status", "==", status.value))
            .where(filter=FieldFilter(time_field, "<", cutoff))
            .limit(self._batch)
            .get()
        )
        # A packed DELIVERY order is waiting for a rider, not for the customer: only pickups expire from READY.
        return [s.id for s in snaps if status != OrderStatus.READY_FOR_PICKUP or (s.to_dict() or {}).get('order_type', 'PICKUP') == 'PICKUP']

    async def sweep(self) -> SweepResult:
        """Expire every overdue PLACED and READY_FOR_PICKUP order (up to ``batch`` of each per call)."""
        result = SweepResult()
        rules = (
            (OrderStatus.PLACED, "created_at", self._settings.placed_expiry_minutes, "Not accepted by the store in time"),
            (OrderStatus.READY_FOR_PICKUP, "ready_at", self._settings.ready_expiry_minutes, "Not collected in time"),
        )
        for status, time_field, minutes, reason in rules:
            if minutes <= 0:
                continue  # 0 disables this rule
            for order_id in await self._overdue(status, time_field, minutes):
                try:
                    await self._lifecycle.transition(
                        order_id, OrderStatus.EXPIRED, actor_uid=SYSTEM_ACTOR, scope=OrderScope(system=True),
                        reason=reason, only_from=frozenset({status}),
                    )
                    result.expired.append(order_id)
                except (InvalidTransitionError, NotFoundError):
                    result.skipped += 1
        if result.expired:
            logger.info("orders_expired", extra={"fields": {"count": len(result.expired)}})
        return result


async def run_expiry_loop(service: ExpiryService, interval_seconds: int) -> None:
    """Background sweep for local/dev and single-instance deployments. Never dies on an error."""
    while True:
        await asyncio.sleep(interval_seconds)
        try:
            await service.sweep()
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - keep sweeping
            logger.warning("expiry_sweep_failed", exc_info=True)


router = APIRouter(prefix="/internal/jobs", tags=["internal: jobs"])


@router.post("/expire-orders")
async def expire_orders_job(
    x_job_secret: str | None = Header(default=None),
    db: Any = Depends(get_db),
    settings: Settings = Depends(get_settings),
    push: PushDispatcher = Depends(get_push_dispatcher),
) -> dict:
    """Run one expiry sweep. For Cloud Scheduler: send the shared secret in ``X-Job-Secret``.

    Disabled (403) unless ``JOB_SECRET`` is configured, so it can never be triggered anonymously.
    """
    configured = settings.job_secret.get_secret_value() if settings.job_secret else ""
    if not configured:
        raise ForbiddenError("Scheduled jobs are not enabled", code="jobs_disabled")
    if not x_job_secret or not hmac.compare_digest(x_job_secret.encode(), configured.encode()):
        raise ForbiddenError("Invalid job secret", code="invalid_job_secret")
    result = await ExpiryService(db, settings, push=push).sweep()
    return ok({"expired": result.expired, "skipped": result.skipped})
