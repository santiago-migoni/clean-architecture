"""The TESTABLE half of the Humble Object split: all formatting logic lives here."""
from typing import Optional

from ...application.errors import CustomerNotFoundError
from ...application.ports.output.place_order_output import PlaceOrderResponse
from ...domain.errors import InvalidOrderError
from .place_order_view_model import PlaceOrderErrorCode, PlaceOrderErrorViewModel, PlaceOrderViewModel

STATUS_LABELS = {"PENDING": "Pending", "CANCELLED": "Cancelled"}


class PlaceOrderPresenter:
    def __init__(self) -> None:
        self.view_model: Optional[PlaceOrderViewModel] = None
        self.error_view_model: Optional[PlaceOrderErrorViewModel] = None

    def present(self, response: PlaceOrderResponse) -> None:
        self.view_model = PlaceOrderViewModel(
            orderId=response.order_id,
            statusLabel=STATUS_LABELS.get(response.status, response.status),
            total=f"${response.total_cents / 100:,.2f}",
        )

    def present_error(self, error: Exception) -> None:
        code = self._code(error)
        # Never leak the message of an unexpected failure.
        self.error_view_model = PlaceOrderErrorViewModel(code, "Unexpected error" if code == "UNKNOWN_ERROR" else str(error))

    @property
    def has_error(self) -> bool:
        return self.error_view_model is not None

    @staticmethod
    def _code(error: Exception) -> PlaceOrderErrorCode:
        if isinstance(error, CustomerNotFoundError):
            return "CUSTOMER_NOT_FOUND"
        if isinstance(error, InvalidOrderError):
            return "INVALID_ORDER"
        return "UNKNOWN_ERROR"
