"""A port owned by orders, in orders' vocabulary. Implemented in orders/infrastructure by calling the
customers module's INPUT port — never by importing customers' domain or infrastructure."""
from typing import Protocol


class CustomerLookup(Protocol):
    def exists(self, customer_id: str) -> bool: ...
