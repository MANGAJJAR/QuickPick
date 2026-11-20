"""Customer pickup-credential route. OWNER: Developer 1.

GET /api/v1/customer/orders/{order_id}/pickup-credential
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.dependencies import require_customer
from app.core.security import AuthUser
from app.modules.pickup.deps import get_pickup_service
from app.modules.pickup.schemas import PickupCredentialOut
from app.modules.pickup.service import PickupService
from app.shared.schemas import ok

router = APIRouter(prefix="/customer/orders", tags=["customer: pickup"])


@router.get("/{order_id}/pickup-credential")
async def get_pickup_credential(
    order_id: str,
    user: AuthUser = Depends(require_customer),
    service: PickupService = Depends(get_pickup_service),
) -> dict:
    """Issue a fresh short-lived QR + OTP (previous ones stop working). Order must be ready."""
    cred = await service.issue_credential(user.uid, order_id)
    return ok(
        PickupCredentialOut(
            order_id=cred.order_id, qr_payload=cred.qr_payload, otp=cred.otp, expires_at=cred.expires_at
        )
    )
