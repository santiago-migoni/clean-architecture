"""The same scenarios against the real (SQLite) and the in-memory repository: both honour the port's contract."""
import sqlite3

import pytest

from shop.main.compose.customers import MIGRATIONS
from shop.modules.customers.application.errors import EmailAlreadyRegisteredError
from shop.modules.customers.domain.customer import Customer
from shop.modules.customers.infrastructure.gateways.in_memory.customer_in_memory_repository import CustomerInMemoryRepository
from shop.modules.customers.infrastructure.gateways.sql_customer_repository import SqlCustomerRepository
from shop.platform.db.migrate import run_migrations


def sql_repository():
    db = sqlite3.connect(":memory:")
    run_migrations(db, MIGRATIONS)
    return SqlCustomerRepository(db)


@pytest.fixture(params=[sql_repository, CustomerInMemoryRepository], ids=["sql", "in-memory"])
def repository(request):
    return request.param()


def test_round_trips_a_customer(repository):
    repository.save(Customer.create("c-1", "Ada", "ada@example.com"))
    assert repository.find_by_id("c-1").email == "ada@example.com"


def test_save_is_an_upsert_by_id(repository):
    repository.save(Customer.create("c-1", "Ada", "ada@example.com"))
    repository.save(Customer.create("c-1", "Ada L.", "ada@example.com"))
    assert repository.find_by_id("c-1").name == "Ada L."


def test_same_email_is_a_conflict_and_the_first_customer_survives(repository):
    repository.save(Customer.create("c-1", "Ada", "ada@example.com"))
    with pytest.raises(EmailAlreadyRegisteredError):
        repository.save(Customer.create("c-2", "Other", "ada@example.com"))
    assert repository.find_by_id("c-1").name == "Ada"  # INSERT OR REPLACE would have deleted it
    assert repository.find_by_id("c-2") is None


def test_returns_none_for_a_missing_id(repository):
    assert repository.find_by_id("missing") is None
