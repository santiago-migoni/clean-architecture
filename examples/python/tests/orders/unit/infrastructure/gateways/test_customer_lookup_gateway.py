"""Only the customers module's INPUT port is faked — never its domain or infrastructure."""
from shop.modules.customers.application.ports.input.get_customer import CustomerView
from shop.modules.orders.infrastructure.gateways.customer_lookup_gateway import CustomerLookupGateway


class FakeGetCustomer:
    def execute(self, customer_id):
        return CustomerView(customer_id, "Ada", "a@b.co") if customer_id == "c-1" else None


def test_translates_the_customers_answer_into_a_boolean():
    gateway = CustomerLookupGateway(FakeGetCustomer())
    assert gateway.exists("c-1") is True
    assert gateway.exists("ghost") is False
