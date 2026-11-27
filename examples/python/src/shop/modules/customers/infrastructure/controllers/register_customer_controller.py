"""Default style (no Output Port): maps the response model to an HTTP answer itself."""
from typing import Any

from ...application.errors import EmailAlreadyRegisteredError
from ...application.interactors.register_customer import RegisterCustomerInteractor, RegisterCustomerRequest
from ...domain.errors import InvalidCustomerError
from .register_customer_http_request import RegisterCustomerHttpRequest


class RegisterCustomerController:
    def __init__(self, use_case: RegisterCustomerInteractor) -> None:
        self._use_case = use_case

    def handle(self, body: RegisterCustomerHttpRequest) -> tuple[int, dict[str, Any]]:
        request = RegisterCustomerRequest(name=str(body.get("name") or ""), email=str(body.get("email") or ""))
        try:
            response = self._use_case.execute(request)
        except InvalidCustomerError as error:
            return 400, {"message": str(error)}
        except EmailAlreadyRegisteredError as error:
            return 409, {"message": str(error)}
        # Anything else propagates: the last-resort handler answers 500 without internals.
        return 201, {"customerId": response.customer_id}
