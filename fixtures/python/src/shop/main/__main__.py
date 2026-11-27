"""Composition root and entry point: python -m shop.main. The only place that wires modules and layers."""
import shop.platform.db.connection, shop.shared.ids
from shop.modules.customers.application.interactors.get_customer import GetCustomerInteractor
from shop.modules.customers.domain.customer import Customer
from shop.modules.customers.infrastructure.gateways.in_memory.customer_in_memory_repository import CustomerInMemoryRepository
from shop.modules.orders.application.interactors.place_order import PlaceOrderInteractor
from shop.modules.orders.infrastructure.controllers.place_order_controller import PlaceOrderController
from shop.modules.orders.infrastructure.gateways.customer_lookup_gateway import CustomerLookupGateway
from shop.modules.orders.infrastructure.gateways.in_memory.order_in_memory_repository import OrderInMemoryRepository


def build() -> PlaceOrderController:
    shop.platform.db.connection.connect().close()
    customers = CustomerInMemoryRepository(Customer("c-1", "Ada"))
    lookup = CustomerLookupGateway(GetCustomerInteractor(customers))
    return PlaceOrderController(PlaceOrderInteractor(OrderInMemoryRepository(), lookup))


if __name__ == "__main__":
    controller = build()
    print(controller.handle({"customer_id": "c-1", "quantity": 2}))
    print(controller.handle({"customer_id": "c-9", "quantity": 2}))
    print(controller.handle({"customer_id": "c-1", "quantity": 0}))
