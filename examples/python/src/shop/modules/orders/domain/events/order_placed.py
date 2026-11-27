"""A DOMAIN EVENT: something the business cares about happened. Plain, immutable data.

Why it exists: other modules react to placed orders (loyalty awards points; an audit log records them), and the use
case must not know who. The infrastructure maps it to the published contract (ports/published).
"""
from __future__ import annotations

from dataclasses import dataclass

from ..order import Order


@dataclass(frozen=True)
class OrderPlaced:
    order_id: str
    customer_id: str
    total_cents: int
    type: str = "OrderPlaced"

    @classmethod
    def of(cls, order: Order) -> OrderPlaced:
        return cls(order_id=order.id, customer_id=order.customer_id, total_cents=order.total_cents)
