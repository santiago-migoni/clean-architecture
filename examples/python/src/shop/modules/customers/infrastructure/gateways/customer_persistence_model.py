"""The row shape, separate from the entity: the schema and the domain evolve independently."""
from typing import NamedTuple

from ...domain.customer import Customer


class CustomerRow(NamedTuple):
    id: str
    name: str
    email: str


def to_domain(row: CustomerRow) -> Customer:
    return Customer.reconstitute(id=row.id, name=row.name, email=row.email)


def to_row(customer: Customer) -> CustomerRow:
    return CustomerRow(customer.id, customer.name, customer.email)
