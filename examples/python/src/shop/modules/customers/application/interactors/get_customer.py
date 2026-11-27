from typing import Optional

from ..ports.input.get_customer import CustomerView
from ..ports.output.customer_repository import CustomerRepository


class GetCustomerInteractor:
    """Implements the GetCustomer input port (structurally)."""

    def __init__(self, repository: CustomerRepository) -> None:
        self._repository = repository

    def execute(self, customer_id: str) -> Optional[CustomerView]:
        customer = self._repository.find_by_id(customer_id)
        return CustomerView(customer.id, customer.name, customer.email) if customer else None
