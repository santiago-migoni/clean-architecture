"""No database, and the customers module is NOT imported: it is faked through orders' own port."""
import sqlite3

import pytest

from shop.modules.orders.application.errors import CustomerNotFoundError
from shop.modules.orders.application.interactors.place_order import (
    PlaceOrderInteractor,
    PlaceOrderLine,
    PlaceOrderRequest,
)
from shop.modules.orders.domain.errors import InvalidOrderError
from shop.modules.orders.domain.events.order_placed import OrderPlaced
from shop.modules.orders.infrastructure.gateways.in_memory.order_in_memory_repository import OrderInMemoryRepository
from shop.modules.orders.infrastructure.gateways.in_memory.recording_order_events import RecordingOrderEvents

LINES = (PlaceOrderLine("p1", 2, 1000),)


class Output:
    def __init__(self) -> None:
        self.presented = []
        self.errors = []

    def present(self, response):
        self.presented.append(response)

    def present_error(self, error):
        self.errors.append(error)


class Customers:
    def __init__(self, exists: bool) -> None:
        self.answer = exists
        self.asked = []

    def exists(self, customer_id):
        self.asked.append(customer_id)
        return self.answer


def make(exists=True):
    output, orders, customers, events = Output(), OrderInMemoryRepository(), Customers(exists), RecordingOrderEvents()
    return PlaceOrderInteractor(output, orders, customers, lambda: "o-1", events), output, orders, customers, events


def test_presents_the_response_and_publishes_order_placed():
    interactor, output, orders, _, events = make()
    interactor.execute(PlaceOrderRequest("c-1", LINES))
    assert [(r.order_id, r.status, r.total_cents) for r in output.presented] == [("o-1", "PENDING", 2000)]
    assert len(orders.find_all()) == 1
    assert events.published == [OrderPlaced("o-1", "c-1", 2000)]


def test_an_unknown_customer_is_presented_and_nothing_is_stored_or_published():
    interactor, output, orders, _, events = make(exists=False)
    interactor.execute(PlaceOrderRequest("ghost", LINES))
    assert isinstance(output.errors[0], CustomerNotFoundError)
    assert orders.find_all() == [] and events.published == []


def test_a_malformed_order_is_rejected_before_asking_the_customers_module():
    interactor, output, _, customers, _ = make()
    interactor.execute(PlaceOrderRequest("", LINES))
    assert isinstance(output.errors[0], InvalidOrderError)
    assert customers.asked == []


def test_an_unexpected_failure_propagates_instead_of_being_presented():
    interactor, output, orders, _, _ = make()

    def broken(order):
        raise sqlite3.OperationalError("database is locked")

    orders.save = broken
    with pytest.raises(sqlite3.OperationalError):
        interactor.execute(PlaceOrderRequest("c-1", LINES))
    assert output.presented == [] and output.errors == []
