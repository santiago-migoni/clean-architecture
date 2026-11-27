# Tests — Python

The complete, tested version of this code is [`examples/python`](../../../examples/python): the same application in every language.

Layout: `tests/<module>/unit/{domain,application,infrastructure}/`, `tests/<module>/integration/` (flat: gateways against a real database), `tests/e2e/`, run with pytest. Files are `test_<name>.py`.

The test of each piece is in that piece's skill reference: entity (`entity`), interactor (`usecase`), presenter (`presenter`), controller (`controller`), gateway integration test (`gateway`). This page holds what spans several pieces.

## Configuration

```toml
# pyproject.toml
[tool.pytest.ini_options]
pythonpath = ["src"]           # import shop.modules... without installing the package
testpaths = ["tests"]
markers = ["integration: needs a real database"]
```

`pytest tests/*/unit` runs the fast suite, with no database and no server. Mark integration tests with `@pytest.mark.integration` (or keep them in `integration/`) so CI can run them separately.

## Cross-module gateway — only the other module's input port is faked

```python
# tests/orders/unit/infrastructure/gateways/test_customer_lookup_gateway.py
from shop.modules.customers.application.ports.input.get_customer import CustomerView
from shop.modules.orders.infrastructure.gateways.customer_lookup_gateway import CustomerLookupGateway


class FakeGetCustomer:
    def execute(self, customer_id: str):
        return CustomerView(customer_id, "Ada", "a@b.co") if customer_id == "c-1" else None


def test_translates_the_customers_answer_into_a_boolean():
    gateway = CustomerLookupGateway(FakeGetCustomer())
    assert gateway.exists("c-1") is True
    assert gateway.exists("ghost") is False
```

## Repository contract — the same scenarios against the real and the in-memory gateway

```python
# tests/customers/integration/test_customer_repository_contract.py
import sqlite3
from pathlib import Path

import pytest

import shop.modules.customers.infrastructure.gateways as gateways
from shop.modules.customers.application.errors import EmailAlreadyRegisteredError
from shop.modules.customers.domain.customer import Customer
from shop.modules.customers.infrastructure.gateways.in_memory.customer_in_memory_repository import CustomerInMemoryRepository
from shop.modules.customers.infrastructure.gateways.sql_customer_repository import SqlCustomerRepository


def sql_repository():
    db = sqlite3.connect(":memory:")
    for migration in sorted((Path(gateways.__file__).parent / "migrations").glob("*.sql")):
        db.executescript(migration.read_text())
    return SqlCustomerRepository(db)


@pytest.fixture(params=[sql_repository, CustomerInMemoryRepository], ids=["sql", "in-memory"])
def repository(request):
    return request.param()


def test_same_email_is_a_conflict_and_the_first_customer_survives(repository):
    repository.save(Customer.create("c-1", "Ada", "ada@example.com"))
    with pytest.raises(EmailAlreadyRegisteredError):
        repository.save(Customer.create("c-2", "Other", "ada@example.com"))
    assert repository.find_by_id("c-1").name == "Ada"
```

## HTTP e2e through both composition roots

```python
# tests/e2e/test_place_order.py
import pytest
from fastapi.testclient import TestClient

from shop.main.app import create_app
from shop.main.testing import create_test_app


@pytest.fixture(params=["production", "in-memory"])
def client(request):
    app = create_app(":memory:") if request.param == "production" else create_test_app()[0]
    return TestClient(app)


def test_unknown_customer_is_404(client):
    res = client.post("/orders", json={"customerId": "ghost", "items": [{"productId": "p1", "quantity": 1, "unitPriceCents": 250}]})
    assert res.status_code == 404


def test_malformed_body_is_400_not_500(client):
    res = client.post("/orders", json={"customerId": "c-1", "items": [{"quantity": "two"}]})
    assert res.status_code == 400
```
