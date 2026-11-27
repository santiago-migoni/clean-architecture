from typing import Literal

from shop.shared.domain_error import DomainError

InvalidOrderReason = Literal["CUSTOMER_REQUIRED", "NO_LINES", "PRODUCT_REQUIRED", "INVALID_QUANTITY", "INVALID_UNIT_PRICE"]


class InvalidOrderError(DomainError):
    """A rule of the Order aggregate was violated.

    `reason` is the stable code the outer layers translate for users; the message is for logs, in English.
    """

    def __init__(self, reason: InvalidOrderReason, message: str) -> None:
        super().__init__(message)
        self.reason = reason
