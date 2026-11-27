"""TEST composition root: the same use cases, controllers and presenters on in-memory implementations of the
same ports, with deterministic ids. Imported by tests, never by production code."""
import itertools
from dataclasses import dataclass

from fastapi import FastAPI

from shop.modules.customers.application.interactors.get_customer import GetCustomerInteractor
from shop.modules.customers.application.interactors.register_customer import RegisterCustomerInteractor
from shop.modules.customers.infrastructure.controllers.get_customer_controller import GetCustomerController
from shop.modules.customers.infrastructure.controllers.register_customer_controller import RegisterCustomerController
from shop.modules.customers.infrastructure.gateways.in_memory.customer_in_memory_repository import CustomerInMemoryRepository
from shop.modules.orders.application.interactors.place_order import PlaceOrderInteractor
from shop.modules.orders.infrastructure.controllers.place_order_controller import PlaceOrderController
from shop.modules.orders.infrastructure.gateways.customer_lookup_gateway import CustomerLookupGateway
from shop.modules.orders.infrastructure.gateways.in_memory.order_in_memory_repository import OrderInMemoryRepository
from shop.modules.orders.infrastructure.gateways.in_memory.recording_order_events import RecordingOrderEvents
from shop.modules.orders.infrastructure.presenters.place_order_presenter import PlaceOrderPresenter
from shop.platform.web.app import RouteHandlers, build_app


@dataclass
class TestApp:
    app: FastAPI
    orders: OrderInMemoryRepository
    events: RecordingOrderEvents


def create_test_app() -> TestApp:
    counter = itertools.count(1)
    new_id = lambda: f"id-{next(counter)}"  # noqa: E731
    customers = CustomerInMemoryRepository()
    orders = OrderInMemoryRepository()
    events = RecordingOrderEvents()
    get_customer = GetCustomerInteractor(customers)

    def make_place_order():
        presenter = PlaceOrderPresenter()
        interactor = PlaceOrderInteractor(presenter, orders, CustomerLookupGateway(get_customer), new_id, events)
        return presenter, PlaceOrderController(interactor)

    app = build_app(
        RouteHandlers(
            RegisterCustomerController(RegisterCustomerInteractor(customers, new_id)),
            GetCustomerController(get_customer),
            make_place_order,
        )
    )
    return TestApp(app, orders, events)
