# Composition root — Python

The complete, tested version of this code is [`examples/python`](../../../examples/python): the same application in every language.

Files: `src/<package>/main/__main__.py` (entry point: `python -m <package>.main`), `src/<package>/main/app.py` (a factory that builds the app), `src/<package>/main/compose/<module>.py` (one function per module), and the test composition root `src/<package>/main/testing.py` (importable by every test, never by production code). Several entry points: `src/<package>/main/<app>/__main__.py`, sharing `compose/`. The examples use FastAPI and `sqlite3` with manual DI.

## One function per module

```python
# src/shop/main/compose/customers.py — composition of the customers module
import sqlite3
from dataclasses import dataclass
from typing import Callable

from shop.modules.customers.application.interactors.get_customer import GetCustomerInteractor
from shop.modules.customers.application.ports.input.get_customer import GetCustomer
from shop.modules.customers.infrastructure.gateways.sql_customer_repository import SqlCustomerRepository


@dataclass(frozen=True)
class CustomersModule:
    get_customer: GetCustomer  # the input port other modules may use


def compose_customers(db: sqlite3.Connection, new_id: Callable[[], str]) -> CustomersModule:
    repository = SqlCustomerRepository(db)
    return CustomersModule(get_customer=GetCustomerInteractor(repository))
```

```python
# src/shop/main/compose/orders.py — composition of the orders module
import sqlite3
from typing import Callable

from shop.modules.customers.application.ports.input.get_customer import GetCustomer
from shop.modules.orders.application.interactors.place_order import PlaceOrderInteractor
from shop.modules.orders.infrastructure.controllers.place_order_controller import PlaceOrderController
from shop.modules.orders.infrastructure.gateways.customer_lookup_gateway import CustomerLookupGateway
from shop.modules.orders.infrastructure.gateways.sql_order_repository import SqlOrderRepository


def compose_orders(db: sqlite3.Connection, new_id: Callable[[], str], get_customer: GetCustomer) -> PlaceOrderController:
    # get_customer is customers' INPUT port: the only legal cross-module link.
    place_order = PlaceOrderInteractor(SqlOrderRepository(db), CustomerLookupGateway(get_customer), new_id)
    return PlaceOrderController(place_order)
```

## The composition root — a factory, and a tiny entry point

```python
# src/shop/main/app.py — the ONLY place that knows every module and layer. Nothing imports from main.
import uuid

from fastapi import FastAPI

from shop.main.compose.customers import compose_customers
from shop.main.compose.orders import compose_orders
from shop.platform.db.connection import connect
from shop.platform.db.migrate import run_migrations
from shop.platform.web.app import build_app


def create_app(db_path: str | None = None) -> FastAPI:
    # 1. Drivers (platform), with values from the configuration. The environment is never read here.
    db = connect(db_path or ":memory:")
    run_migrations(db, ["shop.modules.customers", "shop.modules.orders"])
    new_id = lambda: str(uuid.uuid4())

    # 2. Modules in dependency order; the cross-module tie is an input port.
    customers = compose_customers(db, new_id)
    place_order = compose_orders(db, new_id, customers.get_customer)

    # 3. Delivery
    return build_app(place_order)
```

## Configuration — read once, validated, passed as values

```python
# src/shop/main/config.py — a pure function of the environment it is given: testable without touching os.environ.
import re
from dataclasses import dataclass
from typing import Mapping


class ConfigError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(f"Invalid configuration: {message}")


@dataclass(frozen=True)
class AppConfig:
    db_path: str
    port: int


def load_config(env: Mapping[str, str]) -> AppConfig:
    db_path = env.get("DB_PATH", "").strip() or ":memory:"
    port_text = env.get("PORT", "").strip() or "8000"
    port = int(port_text) if re.fullmatch(r"\d+", port_text) else 0
    if not 1 <= port <= 65535:
        raise ConfigError(f'PORT must be a whole number from 1 to 65535, got "{port_text}"')
    return AppConfig(db_path=db_path, port=port)
```

```python
# src/shop/main/__main__.py — the entry point (python -m shop.main), and the only module that touches os.environ.
import os

import uvicorn

from shop.main.app import create_app
from shop.main.config import load_config

if __name__ == "__main__":
    config = load_config(os.environ)  # a wrong setting stops here, before anything starts
    uvicorn.run(create_app(config.db_path), port=config.port)
```

## Test composition root — the same ports, in-memory implementations

```python
# src/shop/main/testing.py
import itertools

from shop.modules.customers.application.interactors.get_customer import GetCustomerInteractor
from shop.modules.customers.infrastructure.gateways.in_memory.customer_in_memory_repository import CustomerInMemoryRepository
from shop.modules.orders.application.interactors.place_order import PlaceOrderInteractor
from shop.modules.orders.infrastructure.controllers.place_order_controller import PlaceOrderController
from shop.modules.orders.infrastructure.gateways.customer_lookup_gateway import CustomerLookupGateway
from shop.modules.orders.infrastructure.gateways.in_memory.order_in_memory_repository import OrderInMemoryRepository
from shop.platform.web.app import build_app


def create_test_app(*customers):
    ids = itertools.count(1)
    new_id = lambda: f"id-{next(ids)}"  # deterministic ids
    get_customer = GetCustomerInteractor(CustomerInMemoryRepository(*customers))
    orders = OrderInMemoryRepository()
    place_order = PlaceOrderInteractor(orders, CustomerLookupGateway(get_customer), new_id)
    return build_app(PlaceOrderController(place_order)), orders
```

With an Output Port, `compose_orders` returns a factory that builds a NEW presenter, interactor and controller per request, exactly as in the TypeScript reference.
