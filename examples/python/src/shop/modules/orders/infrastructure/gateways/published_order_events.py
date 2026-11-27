"""Implements OrderEvents by publishing each domain event as orders' integration event.

It maps the domain event (orders' own vocabulary) to the published contract (what other modules may rely on). The bus
is injected by main as a function: this adapter never imports platform.
"""
from typing import Callable

from ...application.ports.published.order_placed_v1 import OrderPlacedV1
from ...domain.events.order_placed import OrderPlaced


class PublishedOrderEvents:
    def __init__(self, send: Callable[[OrderPlacedV1], None]) -> None:
        self._send = send

    def publish(self, event: OrderPlaced) -> None:
        self._send(OrderPlacedV1(order_id=event.order_id, customer_id=event.customer_id, total_cents=event.total_cents))
