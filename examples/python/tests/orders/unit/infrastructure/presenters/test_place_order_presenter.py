import pytest

from shop.modules.orders.application.errors import CustomerNotFoundError
from shop.modules.orders.application.ports.output.place_order_output import PlaceOrderResponse
from shop.modules.orders.domain.errors import InvalidOrderError
from shop.modules.orders.infrastructure.presenters.place_order_messages import PLACE_ORDER_MESSAGES
from shop.modules.orders.infrastructure.presenters.place_order_presenter import PlaceOrderPresenter
from shop.platform.i18n.translator import create_translator


def presenter(locale="en"):
    return PlaceOrderPresenter(create_translator(PLACE_ORDER_MESSAGES, "en"), locale)


def test_formats_the_response_model():
    p = presenter()
    p.present(PlaceOrderResponse("o-1", "PENDING", 123456))
    assert (p.view_model.statusLabel, p.view_model.total) == ("Pending", "$1,234.56")
    assert not p.has_error


def test_writes_the_status_in_the_request_language_and_keeps_the_amount_in_dollars():
    p = presenter("es")
    p.present(PlaceOrderResponse("o-1", "PENDING", 123456))
    assert (p.view_model.statusLabel, p.view_model.total) == ("Pendiente", "$1,234.56")


def test_keeps_an_unknown_status_readable():
    p = presenter()
    p.present(PlaceOrderResponse("o-1", "SHIPPED", 0))
    assert (p.view_model.statusLabel, p.view_model.total) == ("SHIPPED", "$0.00")


@pytest.mark.parametrize(
    "locale, error, code, message",
    [
        ("en", CustomerNotFoundError("c-9"), "CUSTOMER_NOT_FOUND", "Customer c-9 not found"),
        ("es", CustomerNotFoundError("c-9"), "CUSTOMER_NOT_FOUND", "No existe el cliente c-9"),
        ("en", InvalidOrderError("NO_LINES", "log text"), "INVALID_ORDER", "Order must have at least one line"),
        ("es", InvalidOrderError("NO_LINES", "log text"), "INVALID_ORDER", "El pedido debe tener al menos una línea"),
    ],
)
def test_maps_a_typed_error_to_its_code_and_a_text_for_the_locale(locale, error, code, message):
    p = presenter(locale)
    p.present_error(error)
    assert (p.error_view_model.code, p.error_view_model.message) == (code, message)


def test_never_leaks_an_unexpected_failure():
    p = presenter()
    p.present_error(RuntimeError("no such table: orders"))
    assert (p.error_view_model.code, p.error_view_model.message) == ("UNKNOWN_ERROR", "Unexpected error")
