"""Application exception hierarchy and the handlers that turn them into API envelopes."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class AppError(Exception):
    """Base class for all expected, client-facing errors."""

    status_code = 400
    code = "bad_request"

    def __init__(self, message: str | None = None, *, code: str | None = None) -> None:
        super().__init__(message or self.code)
        if code:
            self.code = code
        self.message = message or self.code.replace("_", " ")


class UnauthorizedError(AppError):
    """Missing or invalid credentials (401)."""

    status_code = 401
    code = "unauthorized"


class ForbiddenError(AppError):
    """Authenticated but not allowed (403)."""

    status_code = 403
    code = "forbidden"


class NotFoundError(AppError):
    """Resource does not exist or is not visible to the caller (404)."""

    status_code = 404
    code = "not_found"


class ConflictError(AppError):
    """Request conflicts with current state (409)."""

    status_code = 409
    code = "conflict"


class InvalidTransitionError(ConflictError):
    """Order status transition is not permitted by the lifecycle."""

    code = "invalid_status_transition"


class InsufficientStockError(ConflictError):
    """Not enough pickable stock to reserve."""

    code = "insufficient_stock"


class InvalidCredentialError(AppError):
    """Pickup QR/OTP is invalid. Deliberately generic to avoid an oracle."""

    status_code = 400
    code = "invalid_credential"


class CredentialExpiredError(AppError):
    """Pickup credential expired (410)."""

    status_code = 410
    code = "credential_expired"


class TooManyAttemptsError(AppError):
    """Too many failed OTP attempts (429)."""

    status_code = 429
    code = "too_many_attempts"


class ServiceUnavailableError(AppError):
    """A dependency is down (503)."""

    status_code = 503
    code = "service_unavailable"


def error_envelope(code: str, message: str, details: object | None = None) -> dict:
    """Build the standard failure envelope."""
    error: dict = {"code": code, "message": message}
    if details is not None:
        error["details"] = details
    return {"success": False, "data": None, "error": error}


def register_exception_handlers(app: FastAPI) -> None:
    """Attach handlers so every error uses the standard envelope."""

    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(error_envelope(exc.code, exc.message), status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            {"loc": [str(p) for p in e["loc"]], "msg": e["msg"], "type": e["type"]}
            for e in exc.errors()
        ]
        return JSONResponse(
            error_envelope("validation_error", "Request validation failed", details),
            status_code=422,
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            error_envelope(f"http_{exc.status_code}", str(exc.detail)), status_code=exc.status_code
        )

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled_exception")
        return JSONResponse(
            error_envelope("internal_error", "Internal server error"), status_code=500
        )
