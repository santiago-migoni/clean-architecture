from typing import Optional, Protocol

from ....domain.order import Order


class OrderRepository(Protocol):
    def find_by_id(self, order_id: str) -> Optional[Order]: ...

    def save(self, order: Order) -> None: ...
