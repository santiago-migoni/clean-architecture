"""MAIN COMPONENT (composition root): the ONLY place that knows every module and layer. Nothing imports it.

A factory, so tests can build the app without starting a server; __main__.py is the entry point.
It never reads the environment: __main__.py loads the configuration (config.py) and passes the values in.
"""
import json
import logging
import uuid
from dataclasses import asdict
from typing import Callable, Optional

from fastapi import FastAPI

from shop.main.compose import customers as customers_composition
from shop.main.compose import loyalty as loyalty_composition
from shop.main.compose import orders as orders_composition
from shop.main.locales import LOCALES
from shop.platform.db.connection import connect
from shop.modules.loyalty.infrastructure.gateways.sql_award_repository import SqlAwardRepository
from shop.modules.orders.application.ports.published.order_placed_v1 import ORDER_PLACED_V1
from shop.platform.db.migrate import run_migrations
from shop.platform.events.in_process_bus import InProcessBus
from shop.platform.web.app import RouteHandlers, build_app


def create_app(db_path: Optional[str] = None, audit_log: Optional[Callable[[str], None]] = None) -> FastAPI:
    # 1. Drivers (platform)
    db = connect(db_path or ":memory:")
    run_migrations(db, customers_composition.MIGRATIONS + orders_composition.MIGRATIONS + loyalty_composition.MIGRATIONS)
    new_id = lambda: str(uuid.uuid4())  # noqa: E731 — randomness is injected, never used by business rules
    # A failing subscriber is logged and never fails the publisher (see platform/events).
    bus = InProcessBus(lambda error, event: logging.getLogger("shop").error("Subscriber failed on %s", event.type, exc_info=error))

    # 2. Modules in dependency order. Two kinds of tie between modules: orders CALLS customers through its input
    #    port; loyalty REACTS to orders' published event, wired here as a subscription.
    default_locale = LOCALES[0]
    customers = customers_composition.compose_customers(db, new_id, default_locale)
    make_place_order = orders_composition.compose_orders(db, new_id, customers.get_customer, bus.publish, default_locale)
    loyalty = loyalty_composition.compose_loyalty(SqlAwardRepository(db))
    bus.subscribe(ORDER_PLACED_V1, loyalty.order_placed.handle)
    write_audit = audit_log or (lambda line: print(f"audit {line}", flush=True))
    bus.subscribe_all(lambda event: write_audit(json.dumps(asdict(event))))  # every integration event

    # 3. Delivery
    return build_app(
        RouteHandlers(customers.register_controller, customers.get_controller, make_place_order, loyalty.get_points),
        LOCALES,
    )
