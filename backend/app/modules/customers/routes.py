"""Customer profile routes. OWNER: Developer 1.

GET/PATCH /api/v1/customers/me
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.dependencies import require_customer
from app.core.security import AuthUser
from app.modules.auth.deps import get_user_service
from app.modules.auth.service import UserService
from app.modules.customers.schemas import ProfileUpdate
from app.shared.schemas import ok

router = APIRouter(prefix="/customers", tags=["customer: profile"])


@router.get("/me")
async def get_me(
    user: AuthUser = Depends(require_customer), service: UserService = Depends(get_user_service)
) -> dict:
    """Return the caller's profile (created on first call)."""
    return ok(await service.get_or_create(user))


@router.patch("/me")
async def update_me(
    body: ProfileUpdate,
    user: AuthUser = Depends(require_customer),
    service: UserService = Depends(get_user_service),
) -> dict:
    """Update the caller's own name/phone."""
    return ok(await service.update_profile(user, body.model_dump(exclude_none=True)))
