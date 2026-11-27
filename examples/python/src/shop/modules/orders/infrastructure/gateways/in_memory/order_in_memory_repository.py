from typing import Optional

from ....domain.order import Order


class OrderInMemoryRepository:
    def __init__(self) -> None:
        self._by_id: dict[str, Order] = {}

    def find_by_id(self, order_id: str) -> Optional[Order]:
        return self._by_id.get(order_id)

    def save(self, order: Order) -> None:
        self._by_id[order.id] = order

    def find_all(self) -> list[Order]:
        return list(self._by_id.values())
