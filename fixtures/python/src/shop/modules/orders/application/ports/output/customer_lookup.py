"""Port owned by orders. Implemented in orders/infrastructure by calling the customers INPUT port."""
from typing import Protocol


class CustomerLookup(Protocol):
    def exists(self, customer_id: str) -> bool: ...
