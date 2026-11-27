"""TEST composition root: the same use cases, controllers and presenters on in-memory implementations of the
same ports, with deterministic ids. Imported by tests, never by production code."""
import itertools
from dataclasses import dataclass

from fastapi import FastAPI

from shop.modules.customers.application.interactors.get_customer import GetCustomerInteractor
from shop.modules.customers.application.interactors.register_customer import RegisterCustomerInteractor
from shop.main.locales import LOCALES
from shop.modules.customers.infrastructure.controllers.customer_messages import CUSTOMER_MESSAGES
from shop.modules.customers.infrastructure.controllers.get_customer_controller import GetCustomerController
from shop.modules.customers.infrastructure.controllers.register_customer_controller import RegisterCustomerController
from shop.modules.customers.infrastructure.gateways.in_memory.customer_in_memory_repository import CustomerInMemoryRepository
from shop.modules.orders.application.interactors.place_order import PlaceOrderInteractor
from shop.modules.orders.infrastructure.controllers.place_order_controller import PlaceOrderController
from shop.modules.orders.infrastructure.gateways.customer_lookup_gateway import CustomerLookupGateway
from shop.modules.orders.infrastructure.gateways.in_memory.order_in_memory_repository import OrderInMemoryRepository
from shop.main.compose.loyalty import compose_loyalty
from shop.modules.loyalty.infrastructure.gateways.in_memory.award_in_memory_repository import AwardInMemoryRepository
from shop.modules.orders.application.ports.published.order_placed_v1 import ORDER_PLACED_V1
from shop.modules.orders.infrastructure.gateways.published_order_events import PublishedOrderEvents
from shop.modules.orders.infrastructure.presenters.place_order_messages import PLACE_ORDER_MESSAGES
from shop.modules.orders.infrastructure.presenters.place_order_presenter import PlaceOrderPresenter
from shop.platform.events.in_process_bus import InProcessBus
from shop.platform.i18n.translator import create_translator
from shop.platform.web.app import RouteHandlers, build_app


@dataclass
class TestApp:
    app: FastAPI
    orders: OrderInMemoryRepository
    published: list  # every integration event, in order


def create_test_app() -> TestApp:
    counter = itertools.count(1)
    new_id = lambda: f"id-{next(counter)}"  # noqa: E731
    customers = CustomerInMemoryRepository()
    orders = OrderInMemoryRepository()

    def fail(error: Exception, _event) -> None:  # in tests, a failing subscriber must be seen
        raise error

    # The same bus and subscriptions as production; every integration event is also recorded for the tests.
    bus = InProcessBus(fail)
    published: list = []
    bus.subscribe_all(published.append)
    events = PublishedOrderEvents(bus.publish)
    loyalty = compose_loyalty(AwardInMemoryRepository())
    bus.subscribe(ORDER_PLACED_V1, loyalty.order_placed.handle)
    get_customer = GetCustomerInteractor(customers)
    customers_text = create_translator(CUSTOMER_MESSAGES, LOCALES[0])
    orders_text = create_translator(PLACE_ORDER_MESSAGES, LOCALES[0])

    def make_place_order(locale: str):
        presenter = PlaceOrderPresenter(orders_text, locale)
        interactor = PlaceOrderInteractor(presenter, orders, CustomerLookupGateway(get_customer), new_id, events)
        return presenter, PlaceOrderController(interactor)

    app = build_app(
        RouteHandlers(
            RegisterCustomerController(RegisterCustomerInteractor(customers, new_id), customers_text),
            GetCustomerController(get_customer, customers_text),
            make_place_order,
            loyalty.get_points,
        ),
        LOCALES,
    )
    return TestApp(app, orders, published)
