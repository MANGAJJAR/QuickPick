"""Dark-store pickup routes. OWNER: Developer 2.

POST /api/v1/store/pickup/verify-qr, POST /store/pickup/verify-otp, GET /store/pickup/queue
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.dependencies import require_store_staff
from app.core.security import AuthUser
from app.modules.pickup.deps import get_pickup_service, get_queue_service
from app.modules.pickup.queue import PickupQueueService
from app.modules.pickup.schemas import VerifyOtpRequest, VerifyQrRequest
from app.modules.pickup.service import PickupService
from app.shared.schemas import ok

router = APIRouter(prefix="/store/pickup", tags=["store: pickup"])


@router.post("/verify-qr")
async def verify_qr(
    body: VerifyQrRequest,
    user: AuthUser = Depends(require_store_staff),
    service: PickupService = Depends(get_pickup_service),
) -> dict:
    """Verify a scanned QR and complete the handover."""
    return ok(await service.verify_qr(user, body.qr_payload))


@router.post("/verify-otp")
async def verify_otp(
    body: VerifyOtpRequest,
    user: AuthUser = Depends(require_store_staff),
    service: PickupService = Depends(get_pickup_service),
) -> dict:
    """Verify a typed OTP for an order and complete the handover."""
    return ok(await service.verify_otp(user, body.order_id, body.otp))


@router.get("/queue")
async def pickup_queue(
    user: AuthUser = Depends(require_store_staff),
    service: PickupQueueService = Depends(get_queue_service),
) -> dict:
    """Open orders with preparation timers."""
    return ok(await service.queue(user.store_id))  # type: ignore[arg-type]
