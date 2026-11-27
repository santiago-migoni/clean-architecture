"""Default style (no Output Port): maps the response model to an HTTP answer itself."""
from typing import Any

from ...application.errors import EmailAlreadyRegisteredError
from ...application.interactors.register_customer import RegisterCustomerInteractor, RegisterCustomerRequest
from ...domain.errors import InvalidCustomerError
from .customer_messages import Translate
from .register_customer_http_request import RegisterCustomerHttpRequest


class RegisterCustomerController:
    def __init__(self, use_case: RegisterCustomerInteractor, t: Translate) -> None:
        self._use_case = use_case
        self._t = t

    def handle(self, body: RegisterCustomerHttpRequest, locale: str) -> tuple[int, dict[str, Any]]:
        request = RegisterCustomerRequest(name=str(body.get("name") or ""), email=str(body.get("email") or ""))
        try:
            response = self._use_case.execute(request)
        except InvalidCustomerError as error:
            # By the error's type and reason, never by its message (which is for logs).
            return 400, {"code": "INVALID_CUSTOMER", "message": self._t(locale, f"INVALID_CUSTOMER.{error.reason}")}
        except EmailAlreadyRegisteredError as error:
            message = self._t(locale, "EMAIL_ALREADY_REGISTERED", {"email": error.email})
            return 409, {"code": "EMAIL_ALREADY_REGISTERED", "message": message}
        # Anything else propagates: the last-resort handler answers 500 without internals.
        return 201, {"customerId": response.customer_id}
