from typing import Literal

from shop.shared.domain_error import DomainError

InvalidCustomerReason = Literal["NAME_REQUIRED", "INVALID_EMAIL"]


class InvalidCustomerError(DomainError):
    """A rule of the Customer entity was violated.

    `reason` is the stable code the outer layers translate for users; the message is for logs, in English.
    """

    def __init__(self, reason: InvalidCustomerReason, message: str) -> None:
        super().__init__(message)
        self.reason = reason
