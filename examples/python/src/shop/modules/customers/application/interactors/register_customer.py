"""No Input Port: only a controller of this module calls it."""
from dataclasses import dataclass
from typing import Callable

from ...domain.customer import Customer
from ..ports.output.customer_repository import CustomerRepository


@dataclass(frozen=True)
class RegisterCustomerRequest:
    name: str
    email: str


@dataclass(frozen=True)
class RegisterCustomerResponse:
    customer_id: str


class RegisterCustomerInteractor:
    def __init__(self, repository: CustomerRepository, new_id: Callable[[], str]) -> None:
        self._repository = repository
        self._new_id = new_id  # injected: randomness does not belong in business rules

    def execute(self, request: RegisterCustomerRequest) -> RegisterCustomerResponse:
        customer = Customer.create(self._new_id(), request.name, request.email)
        self._repository.save(customer)
        return RegisterCustomerResponse(customer.id)
