"""Plain data — no logic. Formatted for the view / HTTP response."""
from dataclasses import dataclass
from typing import Literal

PlaceOrderErrorCode = Literal["CUSTOMER_NOT_FOUND", "INVALID_ORDER", "UNKNOWN_ERROR"]


@dataclass(frozen=True)
class PlaceOrderViewModel:
    orderId: str
    statusLabel: str  # "Pending" (or "Pendiente") instead of "PENDING"
    total: str  # "$25.00" instead of 2500 (cents)


@dataclass(frozen=True)
class PlaceOrderErrorViewModel:
    code: PlaceOrderErrorCode
    message: str  # in the request's language
