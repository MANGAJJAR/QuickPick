"""Firebase Admin / Firestore initialisation and the shared transaction helper.

Credentials come from Application Default Credentials (the Cloud Run service
account in production, ``gcloud auth application-default login`` locally).
The Firestore and Auth emulators are picked up automatically through the
standard ``FIRESTORE_EMULATOR_HOST`` / ``FIREBASE_AUTH_EMULATOR_HOST`` variables.
"""

from __future__ import annotations

import logging
from typing import Any, Awaitable, Callable, TypeVar

from app.core.config import Settings

logger = logging.getLogger(__name__)

T = TypeVar("T")


def init_firebase_admin(settings: Settings) -> None:
    """Initialise the Firebase Admin SDK once (used for ID token verification)."""
    import firebase_admin

    if firebase_admin._apps:  # noqa: SLF001 - documented idempotency check
        return
    options = {"projectId": settings.gcp_project_id} if settings.gcp_project_id else None
    firebase_admin.initialize_app(options=options)
    logger.info("firebase_admin_initialised")


def create_firestore_client(settings: Settings) -> Any:
    """Create the async Firestore client (one per process, stored on ``app.state``)."""
    from google.cloud import firestore

    return firestore.AsyncClient(
        project=settings.gcp_project_id, database=settings.firestore_database
    )


async def run_in_transaction(db: Any, callback: Callable[[Any], Awaitable[T]]) -> T:
    """Run ``callback(transaction)`` atomically.

    Contract for callbacks (required by Firestore): perform **all reads first**
    (``await ref.get(transaction=tx)``), then queue writes (``tx.set/update/create``).
    On contention the real client re-runs the callback, so it must not have side
    effects outside the transaction. Failures that must still be persisted (for
    example OTP attempt counters) are *returned* as outcomes, not raised, because
    raising aborts the transaction and discards its writes.
    """
    runner = getattr(db, "run_transaction", None)
    if runner is not None:  # in-memory fake used by tests
        return await runner(callback)

    from google.cloud import firestore

    @firestore.async_transactional
    async def _wrapped(transaction: Any) -> T:
        return await callback(transaction)

    return await _wrapped(db.transaction())
