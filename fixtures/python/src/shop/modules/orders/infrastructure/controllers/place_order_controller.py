"""Converts delivery input (a plain dict) into the use case call, and the result into a response."""
from ...application.interactors.place_order import CustomerNotFoundError, PlaceOrderInteractor


class PlaceOrderController:
    def __init__(self, place_order: PlaceOrderInteractor) -> None:
        self._place_order = place_order

    def handle(self, body: dict) -> tuple[int, dict]:
        try:
            from ...domain.order import InvalidOrderError  # imported where it is used
            order_id = self._place_order.execute(body["customer_id"], int(body["quantity"]))
            return 201, {"id": order_id}
        except CustomerNotFoundError:
            return 404, {"error": "customer not found"}
        except InvalidOrderError as error:
            return 400, {"error": str(error)}
