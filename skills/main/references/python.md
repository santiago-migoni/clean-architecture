# Composition root — Python

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
import os
import uuid

from fastapi import FastAPI

from shop.main.compose.customers import compose_customers
from shop.main.compose.orders import compose_orders
from shop.platform.db.connection import connect
from shop.platform.db.migrate import run_migrations
from shop.platform.web.app import build_app


def create_app(db_path: str | None = None) -> FastAPI:
    # 1. Drivers (platform). Environment variables are read here only.
    db = connect(db_path or os.environ.get("DB_PATH", ":memory:"))
    run_migrations(db, ["shop.modules.customers", "shop.modules.orders"])
    new_id = lambda: str(uuid.uuid4())

    # 2. Modules in dependency order; the cross-module tie is an input port.
    customers = compose_customers(db, new_id)
    place_order = compose_orders(db, new_id, customers.get_customer)

    # 3. Delivery
    return build_app(place_order)
```

```python
# src/shop/main/__main__.py — the entry point: python -m shop.main
import os

import uvicorn

from shop.main.app import create_app

if __name__ == "__main__":
    uvicorn.run(create_app(), port=int(os.environ.get("PORT", "8000")))
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
