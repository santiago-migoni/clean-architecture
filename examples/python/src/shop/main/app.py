"""MAIN COMPONENT (composition root): the ONLY place that knows every module and layer. Nothing imports it.

A factory, so tests can build the app without starting a server; __main__.py is the entry point.
It never reads the environment: __main__.py loads the configuration (config.py) and passes the values in.
"""
import uuid
from typing import Callable, Optional

from fastapi import FastAPI

from shop.main.compose import customers as customers_composition
from shop.main.compose import orders as orders_composition
from shop.platform.db.connection import connect
from shop.platform.db.migrate import run_migrations
from shop.platform.web.app import RouteHandlers, build_app


def create_app(db_path: Optional[str] = None, audit_log: Optional[Callable[[str], None]] = None) -> FastAPI:
    # 1. Drivers (platform)
    db = connect(db_path or ":memory:")
    run_migrations(db, customers_composition.MIGRATIONS + orders_composition.MIGRATIONS)
    new_id = lambda: str(uuid.uuid4())  # noqa: E731 — randomness is injected, never used by business rules

    # 2. Modules in dependency order; the cross-module tie is an input port
    customers = customers_composition.compose_customers(db, new_id)
    make_place_order = orders_composition.compose_orders(
        db, new_id, customers.get_customer, audit_log or (lambda line: print(f"audit {line}", flush=True))
    )

    # 3. Delivery
    return build_app(RouteHandlers(customers.register_controller, customers.get_controller, make_place_order))
