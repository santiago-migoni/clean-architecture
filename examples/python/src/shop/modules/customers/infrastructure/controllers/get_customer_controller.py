"""Depends on the Input Port, because other modules also call this use case."""
from typing import Any

from ...application.ports.input.get_customer import GetCustomer
from .customer_messages import Translate


class GetCustomerController:
    def __init__(self, use_case: GetCustomer, t: Translate) -> None:
        self._use_case = use_case
        self._t = t

    def handle(self, customer_id: str, locale: str) -> tuple[int, dict[str, Any]]:
        view = self._use_case.execute(customer_id)
        if view is None:
            message = self._t(locale, "CUSTOMER_NOT_FOUND", {"customerId": customer_id})
            return 404, {"code": "CUSTOMER_NOT_FOUND", "message": message}
        return 200, {"id": view.id, "name": view.name, "email": view.email}
