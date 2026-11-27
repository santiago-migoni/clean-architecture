"""Non-production gateway, used by tests and local runs."""
from typing import Optional

from shop.modules.customers.domain.customer import Customer


class CustomerInMemoryRepository:
    def __init__(self, *seed: Customer) -> None:
        self._by_id = {c.id: c for c in seed}

    def find_by_id(self, customer_id: str) -> Optional[Customer]:
        return self._by_id.get(customer_id)
