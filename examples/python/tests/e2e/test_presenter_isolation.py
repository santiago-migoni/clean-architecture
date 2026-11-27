"""Presenters hold the view model, so the composition root must build a NEW one per request. Tested on the
factory itself, deterministically: requests over this synchronous stack never interleave."""
import sqlite3

from shop.main.compose.orders import compose_orders
from shop.modules.customers.application.ports.input.get_customer import CustomerView


class Customers:
    def execute(self, customer_id):
        return CustomerView(customer_id, "n", "e@e.co") if customer_id == "known" else None


def make_factory():
    return compose_orders(sqlite3.connect(":memory:"), lambda: "o-1", Customers(), publish=lambda event: None, default_locale="en")


def test_builds_a_new_presenter_and_controller_on_every_call():
    make = make_factory()
    (presenter_a, controller_a), (presenter_b, controller_b) = make("en"), make("en")
    assert presenter_a is not presenter_b and controller_a is not controller_b


def test_keeps_the_state_of_two_interleaved_requests_apart():
    make = make_factory()
    failing, other = make("en"), make("en")
    failing[1].handle({"customerId": "ghost", "items": [{"productId": "p", "quantity": 1, "unitPriceCents": 1}]})
    assert failing[0].error_view_model.code == "CUSTOMER_NOT_FOUND"
    assert not other[0].has_error and other[0].view_model is None
