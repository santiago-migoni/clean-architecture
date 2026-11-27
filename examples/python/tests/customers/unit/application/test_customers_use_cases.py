import itertools

import pytest

from shop.modules.customers.application.errors import EmailAlreadyRegisteredError
from shop.modules.customers.application.interactors.get_customer import GetCustomerInteractor
from shop.modules.customers.application.interactors.register_customer import (
    RegisterCustomerInteractor,
    RegisterCustomerRequest,
)
from shop.modules.customers.infrastructure.gateways.in_memory.customer_in_memory_repository import CustomerInMemoryRepository


def make():
    ids = itertools.count(1)
    repository = CustomerInMemoryRepository()
    return repository, RegisterCustomerInteractor(repository, lambda: f"c-{next(ids)}"), GetCustomerInteractor(repository)


def test_registers_and_reads_back_a_customer():
    _, register, get = make()
    response = register.execute(RegisterCustomerRequest("Ada", "ADA@example.com"))
    view = get.execute(response.customer_id)
    assert (view.name, view.email) == ("Ada", "ada@example.com")


def test_get_returns_none_for_an_unknown_customer():
    assert make()[2].execute("ghost") is None


def test_a_duplicate_email_is_rejected():
    _, register, _ = make()
    register.execute(RegisterCustomerRequest("Ada", "ada@example.com"))
    with pytest.raises(EmailAlreadyRegisteredError):
        register.execute(RegisterCustomerRequest("Other", "ada@example.com"))
