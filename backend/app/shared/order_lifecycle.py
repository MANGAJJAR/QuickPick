"""Order lifecycle rules. The ONLY place that defines legal status transitions.

CREATED -> PLACED -> ACCEPTED -> PREPARING -> READY_FOR_PICKUP -> COMPLETED            (PICKUP orders)
                                           READY_FOR_PICKUP -> OUT_FOR_DELIVERY -> DELIVERED   (DELIVERY orders)
with CANCELLED / EXPIRED as terminal exits (see docs/ORDER_LIFECYCLE.md).
"""

from __future__ import annotations

from app.core.exceptions import InvalidTransitionError
from app.shared.enums import OrderStatus as S

ALLOWED_TRANSITIONS: dict[S, frozenset[S]] = {
    S.CREATED: frozenset({S.PLACED, S.CANCELLED}),
    S.PLACED: frozenset({S.ACCEPTED, S.CANCELLED, S.EXPIRED}),
    S.ACCEPTED: frozenset({S.PREPARING, S.CANCELLED}),
    S.PREPARING: frozenset({S.READY_FOR_PICKUP, S.CANCELLED}),
    S.READY_FOR_PICKUP: frozenset({S.COMPLETED, S.OUT_FOR_DELIVERY, S.CANCELLED, S.EXPIRED}),
    S.OUT_FOR_DELIVERY: frozenset({S.DELIVERED}),
    S.COMPLETED: frozenset(),
    S.DELIVERED: frozenset(),
    S.CANCELLED: frozenset(),
    S.EXPIRED: frozenset(),
}

TERMINAL_STATES: frozenset[S] = frozenset({S.COMPLETED, S.DELIVERED, S.CANCELLED, S.EXPIRED})

#: States in which stock is reserved (reserved_quantity includes the order's items).
INVENTORY_RESERVED_STATES: frozenset[S] = frozenset(
    {S.PLACED, S.ACCEPTED, S.PREPARING, S.READY_FOR_PICKUP, S.OUT_FOR_DELIVERY}
)

#: States that count against a store's preparation capacity / appear in the live queue.
ACTIVE_STATES: tuple[S, ...] = (S.PLACED, S.ACCEPTED, S.PREPARING, S.READY_FOR_PICKUP, S.OUT_FOR_DELIVERY)

#: A customer may self-cancel only before the store starts preparing.
CUSTOMER_CANCELLABLE_STATES: frozenset[S] = frozenset({S.PLACED, S.ACCEPTED})

#: Column on the order document that records when each status was entered.
STATUS_TIMESTAMP_FIELD: dict[S, str] = {
    S.ACCEPTED: "accepted_at",
    S.PREPARING: "preparing_at",
    S.READY_FOR_PICKUP: "ready_at",
    S.OUT_FOR_DELIVERY: "dispatched_at",
    S.DELIVERED: "delivered_at",
    S.COMPLETED: "completed_at",
    S.CANCELLED: "cancelled_at",
    S.EXPIRED: "expired_at",
}


def can_transition(current: S, target: S) -> bool:
    """Return True if ``current -> target`` is permitted."""
    return target in ALLOWED_TRANSITIONS[current]


def assert_transition(current: S, target: S) -> None:
    """Raise ``InvalidTransitionError`` unless ``current -> target`` is permitted."""
    if not can_transition(current, target):
        raise InvalidTransitionError(
            f"Cannot move order from {current.value} to {target.value}"
        )
