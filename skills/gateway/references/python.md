# Gateway — Python

Files: `src/<package>/modules/<module>/infrastructure/gateways/`: `sql_<entity>_repository.py` (named after the technology), `<entity>_persistence_model.py` beside it, `in_memory/<entity>_in_memory_repository.py`, `migrations/NNN_<change>.sql`, and cross-module gateways such as `customer_lookup_gateway.py`. The examples use the standard library's `sqlite3`; with SQLAlchemy or another driver the shape is the same (the ORM models live here, never in `domain/`). SQL itself: see the [SQL reference](sql.md).

## Persistence model and mapper

```python
# src/shop/modules/customers/infrastructure/gateways/customer_persistence_model.py
# The row shape, separate from the entity: the schema and the domain evolve independently.
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
```

## SQL gateway

The connection is created in `platform/db/` and injected by `main`: the gateway never imports `platform`.

```python
# src/shop/modules/customers/infrastructure/gateways/sql_customer_repository.py
import sqlite3
from typing import Optional

from ...application.errors import EmailAlreadyRegisteredError
from ...domain.customer import Customer
from .customer_persistence_model import CustomerRow, to_domain, to_row


class SqlCustomerRepository:
    def __init__(self, connection: sqlite3.Connection) -> None:
        self._db = connection

    def find_by_id(self, customer_id: str) -> Optional[Customer]:
        row = self._db.execute("SELECT id, name, email FROM customers WHERE id = ?", (customer_id,)).fetchone()
        return to_domain(CustomerRow(*row)) if row else None

    def save(self, customer: Customer) -> None:
        row = to_row(customer)
        try:
            with self._db:  # one transaction
                # Upsert by id. NEVER "INSERT OR REPLACE": it would delete another customer with the same email.
                self._db.execute(
                    "INSERT INTO customers (id, name, email) VALUES (?, ?, ?) "
                    "ON CONFLICT (id) DO UPDATE SET name = excluded.name, email = excluded.email",
                    row,
                )
        except sqlite3.IntegrityError as error:
            # Translate the driver's error into the one the port declares (anti-corruption).
            if "customers.email" in str(error):
                raise EmailAlreadyRegisteredError(row.email) from error
            raise
```

## In-memory gateway (created when the first test needs it)

```python
# src/shop/modules/customers/infrastructure/gateways/in_memory/customer_in_memory_repository.py
# Same contract as the SQL gateway, including the conflict.
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
```

## Gateway that reaches another module

```python
# src/shop/modules/orders/infrastructure/gateways/customer_lookup_gateway.py
# The only cross-module import allowed: this module's infrastructure → the other module's input port.
from shop.modules.customers.application.ports.input.get_customer import GetCustomer


class CustomerLookupGateway:
    def __init__(self, get_customer: GetCustomer) -> None:  # injected by main
        self._get_customer = get_customer

    def exists(self, customer_id: str) -> bool:
        # Translate between the two modules' models here: orders only needs a boolean.
        return self._get_customer.execute(customer_id) is not None
```

## Integration test — real SQL, in-memory SQLite

```python
# tests/customers/integration/test_sql_customer_repository.py
import sqlite3
from pathlib import Path

import pytest

import shop.modules.customers.infrastructure.gateways as gateways
from shop.modules.customers.application.errors import EmailAlreadyRegisteredError
from shop.modules.customers.domain.customer import Customer
from shop.modules.customers.infrastructure.gateways.sql_customer_repository import SqlCustomerRepository

MIGRATIONS = Path(gateways.__file__).parent / "migrations"


@pytest.fixture
def repository() -> SqlCustomerRepository:
    db = sqlite3.connect(":memory:")
    for migration in sorted(MIGRATIONS.glob("*.sql")):
        db.executescript(migration.read_text())
    return SqlCustomerRepository(db)


def test_round_trips_a_customer(repository):
    repository.save(Customer.create("c-1", "Ada", "ada@example.com"))
    assert repository.find_by_id("c-1").name == "Ada"


def test_same_email_is_a_conflict_and_the_first_customer_survives(repository):
    repository.save(Customer.create("c-1", "Ada", "ada@example.com"))
    with pytest.raises(EmailAlreadyRegisteredError):
        repository.save(Customer.create("c-2", "Other", "ada@example.com"))
    assert repository.find_by_id("c-1").name == "Ada"


def test_returns_none_for_a_missing_id(repository):
    assert repository.find_by_id("missing") is None
```
