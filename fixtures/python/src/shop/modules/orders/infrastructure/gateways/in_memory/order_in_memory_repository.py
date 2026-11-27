"""Non-production gateway, used by tests and local runs."""
from ....domain.order import Order


class OrderInMemoryRepository:
    def __init__(self) -> None:
        self.orders: list[Order] = []

    def save(self, order: Order) -> None:
        self.orders.append(order)
