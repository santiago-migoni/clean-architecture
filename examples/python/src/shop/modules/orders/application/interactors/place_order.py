"""This use case HAS an Output Port (a Presenter formats the answer), so execute returns nothing."""
from dataclasses import dataclass
from typing import Callable

from ...domain.errors import InvalidOrderError
from ...domain.events.order_placed import OrderPlaced
from ...domain.order import Order, OrderLine
from ..errors import CustomerNotFoundError
from ..ports.output.customer_lookup import CustomerLookup
from ..ports.output.order_events import OrderEvents
from ..ports.output.order_repository import OrderRepository
from ..ports.output.place_order_output import PlaceOrderOutput, PlaceOrderResponse


@dataclass(frozen=True)
class PlaceOrderLine:
    product_id: str
    quantity: int
    unit_price_cents: int


@dataclass(frozen=True)
class PlaceOrderRequest:
    customer_id: str
    lines: tuple[PlaceOrderLine, ...]


class PlaceOrderInteractor:
    def __init__(
        self,
        output: PlaceOrderOutput,
        orders: OrderRepository,
        customers: CustomerLookup,
        new_id: Callable[[], str],
        events: OrderEvents,
    ) -> None:
        self._output = output
        self._orders = orders
        self._customers = customers
        self._new_id = new_id
        self._events = events

    def execute(self, request: PlaceOrderRequest) -> None:
        try:
            # Enterprise rules first: a malformed order is rejected before asking another module.
            lines = [OrderLine(l.product_id, l.quantity, l.unit_price_cents) for l in request.lines]
            order = Order.create(self._new_id(), request.customer_id, lines)
            if not self._customers.exists(order.customer_id):
                raise CustomerNotFoundError(order.customer_id)
        except (CustomerNotFoundError, InvalidOrderError) as error:
            self._output.present_error(error)  # only the failures this use case declares
            return
        self._orders.save(order)  # anything failing from here on propagates to the last-resort handler
        self._events.publish(OrderPlaced.of(order))  # only after the order is stored
        self._output.present(PlaceOrderResponse(order.id, order.status, order.total_cents))
