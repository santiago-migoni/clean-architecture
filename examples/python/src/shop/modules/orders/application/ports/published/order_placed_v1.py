"""A PUBLISHED CONTRACT (integration event): what `orders` announces to other modules.

Part of the module's public surface, like application/ports/input. Plain, versioned data: it imports nothing, so a
subscriber depends on this file only, never on orders' domain. A change that breaks a subscriber is a new version
(v2), published beside v1.
"""
from dataclasses import dataclass

ORDER_PLACED_V1 = "orders.order-placed.v1"


@dataclass(frozen=True)
class OrderPlacedV1:
    order_id: str
    customer_id: str
    total_cents: int
    type: str = ORDER_PLACED_V1
