"""The points a customer earned for one order.

The order and the customer belong to other modules: they are referenced by id only, and loyalty keeps its own copy of
the one number it needs (the total).
"""
from __future__ import annotations

from dataclasses import dataclass

from .errors import InvalidPointsAwardError


@dataclass(frozen=True)
class PointsAward:
    order_id: str
    customer_id: str
    points: int

    def __post_init__(self) -> None:
        if not self.order_id.strip():
            raise InvalidPointsAwardError("ORDER_REQUIRED", "An award must reference an order")
        if not self.customer_id.strip():
            raise InvalidPointsAwardError("CUSTOMER_REQUIRED", "An award must reference a customer")
        if not isinstance(self.points, int) or self.points < 0:
            raise InvalidPointsAwardError("INVALID_TOTAL", "Points must be a non-negative integer")

    # Critical Business Rule: one point per whole dollar spent.
    @classmethod
    def for_order(cls, order_id: str, customer_id: str, total_cents: int) -> PointsAward:
        if not isinstance(total_cents, int) or total_cents < 0:
            raise InvalidPointsAwardError("INVALID_TOTAL", "An order total must be a non-negative integer (cents)")
        return cls(order_id, customer_id, total_cents // 100)
