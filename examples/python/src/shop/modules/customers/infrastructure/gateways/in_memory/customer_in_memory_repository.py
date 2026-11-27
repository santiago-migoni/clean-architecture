"""Non-production gateway, same contract as the SQL one (including the conflict)."""
from typing import Optional

from ....application.errors import EmailAlreadyRegisteredError
from ....domain.customer import Customer


class CustomerInMemoryRepository:
    def __init__(self, *seed: Customer) -> None:
        self._by_id: dict[str, Customer] = {c.id: c for c in seed}

    def find_by_id(self, customer_id: str) -> Optional[Customer]:
        return self._by_id.get(customer_id)

    def save(self, customer: Customer) -> None:
        if any(c.id != customer.id and c.email == customer.email for c in self._by_id.values()):
            raise EmailAlreadyRegisteredError(customer.email)
        self._by_id[customer.id] = customer
