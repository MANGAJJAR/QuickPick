"""Pickup credential issuance and verification (core-foundation owned).

Issue (customer, order must be READY_FOR_PICKUP): generate a signed QR token + OTP,
store only their hashes in ``pickup_verifications/{order_id}``.

Verify (store staff): in ONE transaction check store match, not-consumed, not-expired,
attempt limit and hash match, then atomically mark the credential consumed, complete
the order, confirm inventory (reserved -> deducted) and write an audit record.
Failures that must persist (OTP attempt counter, audit rows) are returned as outcomes
rather than raised, because raising would roll the transaction back.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Callable

from app.core.config import Settings
from app.core.exceptions import (
    AppError,
    ConflictError,
    CredentialExpiredError,
    ForbiddenError,
    InvalidCredentialError,
    NotFoundError,
    TooManyAttemptsError,
)
from app.core.firebase import run_in_transaction
from app.core.security import AuthUser
from app.modules.inventory.ledger import InventoryLedger
from app.modules.orders.lifecycle import order_stock_lines, transition_fields
from app.modules.pickup import crypto
from app.shared.enums import OrderStatus, OrderType, VerificationMethod
from app.shared.models import Order, PickupVerification, utc_now
from app.shared.repository import serialize


@dataclass(frozen=True)
class IssuedCredential:
    """What the customer receives (the raw values exist only in this response)."""

    order_id: str
    qr_payload: str
    otp: str
    expires_at: datetime


@dataclass
class _Outcome:
    order: Order | None = None
    error: AppError | None = None


class PickupService:
    """Issues and verifies pickup credentials."""

    def __init__(
        self, db: Any, settings: Settings, clock: Callable[[], datetime] = utc_now
    ) -> None:
        self._db = db
        self._settings = settings
        self._clock = clock
        self._ledger = InventoryLedger(db)
        self._secret = settings.pickup_token_secret.get_secret_value()  # type: ignore[union-attr]

    def _refs(self, order_id: str) -> tuple[Any, Any]:
        return (
            self._db.collection("orders").document(order_id),
            self._db.collection("pickup_verifications").document(order_id),
        )

    async def issue_credential(self, customer_id: str, order_id: str) -> IssuedCredential:
        """Issue (or re-issue, invalidating the previous one) a credential for the owner's order."""
        order_ref, ver_ref = self._refs(order_id)
        now = self._clock()
        expires_at = now + timedelta(seconds=self._settings.pickup_token_ttl_seconds)

        async def _run(tx: Any) -> IssuedCredential:
            osnap = await order_ref.get(transaction=tx)
            if not osnap.exists:
                raise NotFoundError("Order not found")
            order = Order.model_validate(osnap.to_dict())
            if order.customer_id != customer_id:
                raise NotFoundError("Order not found")
            if order.order_type != OrderType.PICKUP:
                raise ConflictError("Delivery orders do not use a pickup code", code="not_a_pickup_order")
            if order.order_status != OrderStatus.READY_FOR_PICKUP:
                raise ConflictError(
                    "Pickup credential is only available when the order is ready for pickup",
                    code="order_not_ready",
                )
            vsnap = await ver_ref.get(transaction=tx)
            if vsnap.exists and vsnap.to_dict().get("consumed_at") is not None:
                raise ConflictError("Order already picked up", code="credential_already_used")

            token = crypto.generate_token(self._secret, order_id, int(expires_at.timestamp()))
            otp = crypto.generate_otp(self._settings.pickup_otp_length)
            verification = PickupVerification(
                order_id=order_id,
                store_id=order.store_id,
                customer_id=customer_id,
                token_hash=crypto.hash_token(token),
                otp_hash=crypto.hash_otp(self._secret, order_id, otp),
                issued_at=now,
                expires_at=expires_at,
            )
            tx.set(ver_ref, serialize(verification))
            tx.update(order_ref, {"pickup_code_reference": order_id, "updated_at": now})
            return IssuedCredential(order_id, token, otp, expires_at)

        return await run_in_transaction(self._db, _run)

    async def verify_qr(self, staff: AuthUser, token: str) -> Order:
        """Verify a scanned QR payload and complete the handover."""
        order_id, _ = crypto.parse_token(self._secret, token)  # stateless signature check
        presented_hash = crypto.hash_token(token)
        return await self._complete(
            staff,
            order_id,
            VerificationMethod.QR,
            lambda v: crypto.constant_time_equals(v.token_hash, presented_hash),
        )

    async def verify_otp(self, staff: AuthUser, order_id: str, otp: str) -> Order:
        """Verify a typed OTP for ``order_id`` and complete the handover."""
        presented_hash = crypto.hash_otp(self._secret, order_id, otp.strip())
        return await self._complete(
            staff,
            order_id,
            VerificationMethod.OTP,
            lambda v: crypto.constant_time_equals(v.otp_hash, presented_hash),
        )

    async def _complete(
        self,
        staff: AuthUser,
        order_id: str,
        method: VerificationMethod,
        matches: Callable[[PickupVerification], bool],
    ) -> Order:
        order_ref, ver_ref = self._refs(order_id)
        now = self._clock()

        async def _run(tx: Any) -> _Outcome:
            vsnap = await ver_ref.get(transaction=tx)
            osnap = await order_ref.get(transaction=tx)
            if not vsnap.exists or not osnap.exists:
                return _Outcome(error=InvalidCredentialError())
            ver = PickupVerification.model_validate(vsnap.to_dict())
            order = Order.model_validate(osnap.to_dict())

            def audit(event: str, reason: str | None = None) -> None:
                tx.create(
                    ver_ref.collection("audit").document(),
                    serialize(
                        {
                            "event": event,
                            "reason": reason,
                            "method": method,
                            "staff_uid": staff.uid,
                            "staff_store_id": staff.store_id,
                            "order_id": order_id,
                            "at": now,
                        }
                    ),
                )

            def reject(error: AppError, reason: str, *, count_attempt: bool = False) -> _Outcome:
                if count_attempt:
                    tx.update(ver_ref, {"attempts": ver.attempts + 1})
                audit("REJECTED", reason)
                return _Outcome(error=error)

            if ver.store_id != staff.store_id or order.store_id != staff.store_id:
                return reject(ForbiddenError("Credential belongs to another store", code="credential_wrong_store"), "wrong_store")
            if ver.consumed_at is not None:
                return reject(ConflictError("Credential already used", code="credential_already_used"), "already_used")
            if now >= ver.expires_at:
                return reject(CredentialExpiredError("Credential expired"), "expired")
            if method is VerificationMethod.OTP and ver.attempts >= self._settings.pickup_max_verify_attempts:
                return reject(TooManyAttemptsError("Too many failed attempts; ask the customer to refresh the code"), "attempts_exhausted")
            if not matches(ver):
                return reject(InvalidCredentialError(), "mismatch", count_attempt=method is VerificationMethod.OTP)
            if order.order_type != OrderType.PICKUP:
                return reject(ConflictError("This is a delivery order", code="not_a_pickup_order"), "not_pickup")
            if order.order_status != OrderStatus.READY_FOR_PICKUP:
                return reject(ConflictError("Order is not ready for pickup", code="order_not_ready"), "order_not_ready")

            # --- success path: all reads first, then writes -------------------------------
            read_set = await self._ledger.read(tx, order.store_id, order_stock_lines(order))
            self._ledger.confirm(tx, read_set)
            fields = transition_fields(order, OrderStatus.COMPLETED, staff.uid, now)
            tx.update(order_ref, serialize(fields))
            tx.update(
                ver_ref,
                serialize({"consumed_at": now, "consumed_by": staff.uid, "method": method.value, "attempts": ver.attempts + (1 if method is VerificationMethod.OTP else 0)}),
            )
            audit("VERIFIED")
            return _Outcome(order=order.model_copy(update=fields))

        outcome = await run_in_transaction(self._db, _run)
        if outcome.error is not None:
            raise outcome.error
        assert outcome.order is not None
        return outcome.order
