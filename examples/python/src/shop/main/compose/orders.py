"""Composition of the orders module."""
import sqlite3
from pathlib import Path
from typing import Callable

import shop.modules.orders.infrastructure.gateways as orders_gateways
from shop.modules.customers.application.ports.input.get_customer import GetCustomer
from shop.modules.orders.application.interactors.place_order import PlaceOrderInteractor
from shop.modules.orders.infrastructure.controllers.place_order_controller import PlaceOrderController
from shop.modules.orders.application.ports.published.order_placed_v1 import OrderPlacedV1
from shop.modules.orders.infrastructure.gateways.customer_lookup_gateway import CustomerLookupGateway
from shop.modules.orders.infrastructure.gateways.published_order_events import PublishedOrderEvents
from shop.modules.orders.infrastructure.gateways.sql_order_repository import SqlOrderRepository
from shop.modules.orders.infrastructure.presenters.place_order_messages import PLACE_ORDER_MESSAGES
from shop.modules.orders.infrastructure.presenters.place_order_presenter import PlaceOrderPresenter
from shop.platform.db.migrate import Migration
from shop.platform.i18n.translator import create_translator

MIGRATIONS = [
    Migration(f"orders/{p.stem}", p.read_text())
    for p in sorted((Path(orders_gateways.__file__).parent / "migrations").glob("*.sql"))
]


def compose_orders(
    db: sqlite3.Connection,
    new_id: Callable[[], str],
    get_customer: GetCustomer,  # customers' INPUT port: the only legal cross-module link
    publish: Callable[[OrderPlacedV1], None],  # the bus: orders announces, never knows who listens
    default_locale: str,
) -> Callable[[str], tuple[PlaceOrderPresenter, PlaceOrderController]]:
    orders = SqlOrderRepository(db)
    customers = CustomerLookupGateway(get_customer)
    events = PublishedOrderEvents(publish)
    t = create_translator(PLACE_ORDER_MESSAGES, default_locale)

    def make_place_order(locale: str) -> tuple[PlaceOrderPresenter, PlaceOrderController]:
        # Presenters are stateful: a NEW presenter + interactor + controller per request, in the request's locale.
        presenter = PlaceOrderPresenter(t, locale)
        interactor = PlaceOrderInteractor(presenter, orders, customers, new_id, events)
        return presenter, PlaceOrderController(interactor)

    return make_place_order
