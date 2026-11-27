import pytest

from shop.modules.orders.application.errors import CustomerNotFoundError
from shop.modules.orders.application.ports.output.place_order_output import PlaceOrderResponse
from shop.modules.orders.domain.errors import InvalidOrderError
from shop.modules.orders.infrastructure.presenters.place_order_presenter import PlaceOrderPresenter


def test_formats_the_response_model():
    presenter = PlaceOrderPresenter()
    presenter.present(PlaceOrderResponse("o-1", "PENDING", 123456))
    assert (presenter.view_model.statusLabel, presenter.view_model.total) == ("Pending", "$1,234.56")
    assert not presenter.has_error


def test_keeps_an_unknown_status_readable():
    presenter = PlaceOrderPresenter()
    presenter.present(PlaceOrderResponse("o-1", "SHIPPED", 0))
    assert (presenter.view_model.statusLabel, presenter.view_model.total) == ("SHIPPED", "$0.00")


@pytest.mark.parametrize(
    "error, code",
    [(CustomerNotFoundError("c-9"), "CUSTOMER_NOT_FOUND"), (InvalidOrderError("Order must have at least one line"), "INVALID_ORDER")],
)
def test_maps_a_typed_error_to_its_code_and_message(error, code):
    presenter = PlaceOrderPresenter()
    presenter.present_error(error)
    assert (presenter.error_view_model.code, presenter.error_view_model.message) == (code, str(error))


def test_never_leaks_an_unexpected_failure():
    presenter = PlaceOrderPresenter()
    presenter.present_error(RuntimeError("no such table: orders"))
    assert (presenter.error_view_model.code, presenter.error_view_model.message) == ("UNKNOWN_ERROR", "Unexpected error")
