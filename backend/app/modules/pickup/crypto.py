"""Pickup credential cryptography.

* QR payload: ``qp1.<order_id>.<expiry_epoch>.<nonce>.<hmac>``; the HMAC-SHA256
  signature (server secret) is checked before any database access, so forged
  payloads are rejected statelessly.
* Only ``sha256(token)`` is stored. The OTP is stored as a *keyed* hash
  (HMAC of order_id + otp) because a bare hash of a 6-digit number is brute-forceable
  from a leaked database.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets

from app.core.exceptions import InvalidCredentialError

_PREFIX = "qp1"


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _sign(secret: str, message: str) -> str:
    return _b64(hmac.new(secret.encode(), message.encode(), hashlib.sha256).digest())


def generate_token(secret: str, order_id: str, expires_epoch: int) -> str:
    """Create a signed, single-purpose QR token for an order."""
    nonce = secrets.token_urlsafe(16).replace(".", "")
    body = f"{_PREFIX}.{order_id}.{expires_epoch}.{nonce}"
    return f"{body}.{_sign(secret, body)}"


def parse_token(secret: str, token: str) -> tuple[str, int]:
    """Validate the signature and return ``(order_id, expires_epoch)``.

    Raises ``InvalidCredentialError`` for any malformed or forged token (constant-time compare).
    """
    parts = token.strip().split(".")
    if len(parts) != 5 or parts[0] != _PREFIX:
        raise InvalidCredentialError()
    body, signature = ".".join(parts[:4]), parts[4]
    if not hmac.compare_digest(_sign(secret, body), signature):
        raise InvalidCredentialError()
    try:
        return parts[1], int(parts[2])
    except ValueError as exc:
        raise InvalidCredentialError() from exc


def hash_token(token: str) -> str:
    """SHA-256 of the (high-entropy, signed) token; this is what gets stored."""
    return hashlib.sha256(token.encode()).hexdigest()


def generate_otp(length: int) -> str:
    """Cryptographically random numeric OTP, zero-padded."""
    return str(secrets.randbelow(10**length)).zfill(length)


def hash_otp(secret: str, order_id: str, otp: str) -> str:
    """Keyed hash of an OTP bound to its order."""
    return hmac.new(secret.encode(), f"otp:{order_id}:{otp}".encode(), hashlib.sha256).hexdigest()


def constant_time_equals(a: str, b: str) -> bool:
    """Timing-safe string comparison."""
    return hmac.compare_digest(a.encode(), b.encode())
