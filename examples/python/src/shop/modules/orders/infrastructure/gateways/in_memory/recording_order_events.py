"""Non-production OrderEvents: keeps the events so tests can assert on them."""
from ....domain.events.order_placed import OrderPlaced


class RecordingOrderEvents:
    def __init__(self) -> None:
        self.published: list[OrderPlaced] = []

    def publish(self, event: OrderPlaced) -> None:
        self.published.append(event)
