"""The only kind of cross-module import allowed: infrastructure -> another module's application/ports/input."""
from shop.modules.customers.application.ports.input.get_customer import GetCustomer


class CustomerLookupGateway:
    def __init__(self, get_customer: GetCustomer) -> None:  # injected by main
        self._get_customer = get_customer

    def exists(self, customer_id: str) -> bool:
        # Translate between the two modules' models here: orders only needs a boolean.
        return self._get_customer.execute(customer_id) is not None
