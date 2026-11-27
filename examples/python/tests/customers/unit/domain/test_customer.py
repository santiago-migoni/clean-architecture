import pytest

from shop.modules.customers.domain.customer import Customer
from shop.modules.customers.domain.errors import InvalidCustomerError
from shop.shared.domain_error import DomainError


def test_create_normalises_name_and_email():
    customer = Customer.create("c-1", "  Ada ", " ADA@Example.com ")
    assert (customer.name, customer.email) == ("Ada", "ada@example.com")


@pytest.mark.parametrize("name, email", [("", "a@b.co"), ("Ada", "not-an-email")])
def test_rejects_an_invalid_customer(name, email):
    with pytest.raises(InvalidCustomerError):
        Customer.create("c-1", name, email)


def test_reconstitute_runs_the_same_invariants():
    with pytest.raises(InvalidCustomerError):
        Customer.reconstitute("c-1", "Ada", "broken")


def test_the_domain_error_comes_from_the_shared_kernel():
    assert issubclass(InvalidCustomerError, DomainError)
