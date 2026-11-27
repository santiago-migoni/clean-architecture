from typing import Optional, Protocol

from ....domain.customer import Customer


class CustomerRepository(Protocol):
    def find_by_id(self, customer_id: str) -> Optional[Customer]: ...

    def save(self, customer: Customer) -> None:
        """Upsert by id. Raises EmailAlreadyRegisteredError if ANOTHER customer uses the same email."""
        ...
