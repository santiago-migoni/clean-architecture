from typing import Protocol

from shop.modules.orders.domain.order import Order


class OrderRepository(Protocol):
    def save(self, order: Order) -> None: ...
