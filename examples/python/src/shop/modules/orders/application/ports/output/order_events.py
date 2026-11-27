"""Where the use case announces its domain events. An in-process bus today; a broker tomorrow."""
from typing import Protocol

from ....domain.events.order_placed import OrderPlaced


class OrderEvents(Protocol):
    def publish(self, event: OrderPlaced) -> None: ...
