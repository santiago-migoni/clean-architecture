import pytest

from shop.modules.customers.application.errors import EmailAlreadyRegisteredError
from shop.modules.customers.application.ports.input.get_customer import CustomerView
from shop.modules.customers.domain.errors import InvalidCustomerError
from shop.modules.customers.infrastructure.controllers.get_customer_controller import GetCustomerController
from shop.modules.customers.infrastructure.controllers.register_customer_controller import RegisterCustomerController


class Raising:
    def __init__(self, error: Exception) -> None:
        self.error = error

    def execute(self, _):
        raise self.error


@pytest.mark.parametrize("error, status", [(InvalidCustomerError("bad"), 400), (EmailAlreadyRegisteredError("a@b.co"), 409)])
def test_maps_known_failures_to_statuses(error, status):
    assert RegisterCustomerController(Raising(error)).handle({"name": "Ada", "email": "a@b.co"})[0] == status


def test_lets_an_unexpected_failure_propagate():
    with pytest.raises(RuntimeError):
        RegisterCustomerController(Raising(RuntimeError("database is locked"))).handle({})


def test_get_answers_404_for_an_unknown_customer_and_200_otherwise():
    class Found:
        def execute(self, customer_id):
            return CustomerView(customer_id, "Ada", "a@b.co") if customer_id == "c-1" else None

    controller = GetCustomerController(Found())
    assert controller.handle("c-1") == (200, {"id": "c-1", "name": "Ada", "email": "a@b.co"})
    assert controller.handle("ghost")[0] == 404
