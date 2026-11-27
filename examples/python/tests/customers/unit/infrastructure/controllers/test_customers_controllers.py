import pytest

from shop.modules.customers.application.errors import EmailAlreadyRegisteredError
from shop.modules.customers.application.ports.input.get_customer import CustomerView
from shop.modules.customers.domain.errors import InvalidCustomerError
from shop.modules.customers.infrastructure.controllers.customer_messages import CUSTOMER_MESSAGES
from shop.modules.customers.infrastructure.controllers.get_customer_controller import GetCustomerController
from shop.modules.customers.infrastructure.controllers.register_customer_controller import RegisterCustomerController
from shop.platform.i18n.translator import create_translator

t = create_translator(CUSTOMER_MESSAGES, "en")


class Raising:
    def __init__(self, error: Exception) -> None:
        self.error = error

    def execute(self, _):
        raise self.error


@pytest.mark.parametrize(
    "error, locale, answer",
    [
        (InvalidCustomerError("INVALID_EMAIL", "log text"), "es", (400, {"code": "INVALID_CUSTOMER", "message": "El email del cliente no es válido"})),
        (EmailAlreadyRegisteredError("a@b.co"), "en", (409, {"code": "EMAIL_ALREADY_REGISTERED", "message": "Email a@b.co is already registered"})),
    ],
)
def test_maps_known_failures_to_a_status_a_code_and_a_text_in_the_request_language(error, locale, answer):
    assert RegisterCustomerController(Raising(error), t).handle({"name": "Ada", "email": "a@b.co"}, locale) == answer


def test_lets_an_unexpected_failure_propagate():
    with pytest.raises(RuntimeError):
        RegisterCustomerController(Raising(RuntimeError("database is locked")), t).handle({}, "en")


def test_get_answers_404_for_an_unknown_customer_and_200_otherwise():
    class Found:
        def execute(self, customer_id):
            return CustomerView(customer_id, "Ada", "a@b.co") if customer_id == "c-1" else None

    controller = GetCustomerController(Found(), t)
    assert controller.handle("c-1", "en") == (200, {"id": "c-1", "name": "Ada", "email": "a@b.co"})
    assert controller.handle("ghost", "es") == (404, {"code": "CUSTOMER_NOT_FOUND", "message": "No existe el cliente ghost"})
