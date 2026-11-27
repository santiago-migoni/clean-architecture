"""The only kind of cross-module import allowed: infrastructure -> another module's application/ports/input."""
from shop.modules.customers.application.ports.input.get_customer import GetCustomer
from shop.modules.orders.application.ports.output.customer_lookup import CustomerLookup


class CustomerLookupGateway(CustomerLookup):
    def __init__(self, get_customer: GetCustomer) -> None:
        self._get_customer = get_customer

    def exists(self, customer_id: str) -> bool:
        return self._get_customer.execute(customer_id) is not None
