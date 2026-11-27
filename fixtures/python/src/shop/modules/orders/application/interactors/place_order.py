from shop.shared import ids
from ...domain.order import Order
from ..ports.output import customer_lookup, order_repository


class CustomerNotFoundError(LookupError):
    pass


class PlaceOrderInteractor:
    def __init__(self, orders: order_repository.OrderRepository, customers: customer_lookup.CustomerLookup) -> None:
        self._orders = orders
        self._customers = customers

    def execute(self, customer_id: str, quantity: int) -> str:
        if not self._customers.exists(customer_id):
            raise CustomerNotFoundError(customer_id)
        order = Order(ids.new_id("o"), customer_id, quantity)
        self._orders.save(order)
        return order.id
