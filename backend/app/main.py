"""FastAPI application factory."""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import Settings, get_settings
from app.core.exceptions import ServiceUnavailableError, register_exception_handlers
from app.core.firebase import create_firestore_client, init_firebase_admin
from app.core.logging import configure_logging, request_id_var
from app.core.security import FirebaseTokenVerifier, TokenVerifier
from app.shared.schemas import ok

logger = logging.getLogger("quickpick")


def create_app(
    settings: Settings | None = None, db: Any | None = None, token_verifier: TokenVerifier | None = None
) -> FastAPI:
    """Build the app. Tests inject ``db`` and ``token_verifier``; production leaves them ``None``."""
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.settings = settings
        if db is None:
            init_firebase_admin(settings)
            app.state.db = create_firestore_client(settings)
        else:
            app.state.db = db
        app.state.token_verifier = token_verifier or FirebaseTokenVerifier(settings)
        logger.info("startup_complete", extra={"fields": {"environment": settings.environment}})
        yield

    app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
    # Also set eagerly so dependency overrides / TestClient without lifespan still work.
    app.state.settings = settings
    if db is not None:
        app.state.db = db
    if token_verifier is not None:
        app.state.token_verifier = token_verifier

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    @app.middleware("http")
    async def _request_context(request: Request, call_next):  # type: ignore[no-untyped-def]
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
        token = request_id_var.set(request_id)
        started = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            request_id_var.reset(token)
        response.headers["x-request-id"] = request_id
        logger.info(
            "request",
            extra={"fields": {"method": request.method, "path": request.url.path,
                              "status": response.status_code,
                              "duration_ms": round((time.perf_counter() - started) * 1000, 1)}},
        )
        return response

    register_exception_handlers(app)

    @app.get("/health", tags=["system"])
    async def health() -> dict:
        """Liveness: the process is up."""
        return ok({"status": "ok"})

    @app.get("/ready", tags=["system"])
    async def ready(request: Request) -> dict:
        """Readiness: Firestore is reachable."""
        try:
            await asyncio.wait_for(
                request.app.state.db.collection("_health").document("ping").get(), timeout=3
            )
        except Exception as exc:  # noqa: BLE001 - includes asyncio.TimeoutError
            logger.warning("readiness_failed", extra={"fields": {"error": type(exc).__name__}})
            raise ServiceUnavailableError("Database unreachable") from exc
        return ok({"status": "ready"})

    app.include_router(api_router)
    return app


app = create_app()
