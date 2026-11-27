from typing import Literal

from shop.shared.domain_error import DomainError

InvalidPointsAwardReason = Literal["ORDER_REQUIRED", "CUSTOMER_REQUIRED", "INVALID_TOTAL"]


class InvalidPointsAwardError(DomainError):
    """A rule of the PointsAward entity was violated. `reason` is the stable code; the message is for logs."""

    def __init__(self, reason: InvalidPointsAwardReason, message: str) -> None:
        super().__init__(message)
        self.reason = reason
