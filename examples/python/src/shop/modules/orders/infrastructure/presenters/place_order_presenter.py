"""The TESTABLE half of the Humble Object split: all formatting logic lives here, including the language.

The use case returns codes (a status, a failure reason) and the presenter writes them for the request's locale.
"""
from typing import Optional

from ...application.errors import CustomerNotFoundError
from ...application.ports.output.place_order_output import PlaceOrderResponse
from ...domain.errors import InvalidOrderError
from .place_order_messages import Translate
from .place_order_view_model import PlaceOrderErrorCode, PlaceOrderErrorViewModel, PlaceOrderViewModel


class PlaceOrderPresenter:
    def __init__(self, t: Translate, locale: str) -> None:  # one presenter per request: the locale is the request's
        self._t = t
        self._locale = locale
        self.view_model: Optional[PlaceOrderViewModel] = None
        self.error_view_model: Optional[PlaceOrderErrorViewModel] = None

    def present(self, response: PlaceOrderResponse) -> None:
        key = f"STATUS.{response.status}"
        label = self._t(self._locale, key)
        self.view_model = PlaceOrderViewModel(
            orderId=response.order_id,
            statusLabel=response.status if label == key else label,
            # The amount is in US dollars whatever the language: the currency is a fact of the order, not of the reader.
            total=f"${response.total_cents / 100:,.2f}",
        )

    def present_error(self, error: Exception) -> None:
        if isinstance(error, CustomerNotFoundError):
            self._fail("CUSTOMER_NOT_FOUND", self._t(self._locale, "CUSTOMER_NOT_FOUND", {"customerId": error.customer_id}))
        elif isinstance(error, InvalidOrderError):
            self._fail("INVALID_ORDER", self._t(self._locale, f"INVALID_ORDER.{error.reason}"))
        else:  # never leak the message of an unexpected failure
            self._fail("UNKNOWN_ERROR", self._t(self._locale, "UNKNOWN_ERROR"))

    @property
    def has_error(self) -> bool:
        return self.error_view_model is not None

    def _fail(self, code: PlaceOrderErrorCode, message: str) -> None:
        self.error_view_model = PlaceOrderErrorViewModel(code, message)
