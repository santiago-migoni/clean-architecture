"""With an Output Port the controller never builds the answer: the presenter does, and the route sends it."""
from typing import Any

from ...application.interactors.place_order import PlaceOrderInteractor, PlaceOrderLine, PlaceOrderRequest
from .place_order_http_request import PlaceOrderHttpRequest


def _int(value: Any) -> int:
    # Coerced, not validated: a value that is not a whole number becomes -1, which the entity rejects.
    if isinstance(value, bool):
        return -1
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return -1


class PlaceOrderController:
    def __init__(self, use_case: PlaceOrderInteractor) -> None:
        self._use_case = use_case

    def handle(self, body: PlaceOrderHttpRequest) -> None:
        items = body.get("items") if isinstance(body.get("items"), list) else []
        request = PlaceOrderRequest(
            customer_id=str(body.get("customerId") or ""),
            lines=tuple(
                PlaceOrderLine(str(i.get("productId") or ""), _int(i.get("quantity")), _int(i.get("unitPriceCents")))
                for i in items
                if isinstance(i, dict)
            ),
        )
        self._use_case.execute(request)
