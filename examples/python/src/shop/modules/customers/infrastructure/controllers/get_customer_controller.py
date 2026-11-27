"""Depends on the Input Port, because other modules also call this use case."""
from typing import Any

from ...application.ports.input.get_customer import GetCustomer


class GetCustomerController:
    def __init__(self, use_case: GetCustomer) -> None:
        self._use_case = use_case

    def handle(self, customer_id: str) -> tuple[int, dict[str, Any]]:
        view = self._use_case.execute(customer_id)
        if view is None:
            return 404, {"message": f"Customer {customer_id} not found"}
        return 200, {"id": view.id, "name": view.name, "email": view.email}
