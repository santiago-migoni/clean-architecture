from typing import Optional, Protocol

from ....domain.customer import Customer


class CustomerRepository(Protocol):
    def find_by_id(self, customer_id: str) -> Optional[Customer]: ...
