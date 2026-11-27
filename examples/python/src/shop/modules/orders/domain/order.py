"""Enterprise business rules of the orders module. The customer is referenced by id only."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from .errors import InvalidOrderError

OrderStatus = Literal["PENDING", "CANCELLED"]


@dataclass(frozen=True)
class OrderLine:
    product_id: str
    quantity: int
    unit_price_cents: int


@dataclass(frozen=True)
class Order:
    id: str
    customer_id: str
    lines: tuple[OrderLine, ...]
    status: OrderStatus

    def __post_init__(self) -> None:
        if not self.customer_id.strip():
            raise InvalidOrderError("CUSTOMER_REQUIRED", "Order must reference a customer")
        if not self.lines:
            raise InvalidOrderError("NO_LINES", "Order must have at least one line")
        for line in self.lines:
            if not line.product_id.strip():
                raise InvalidOrderError("PRODUCT_REQUIRED", "Line product id must not be empty")
            if not isinstance(line.quantity, int) or line.quantity <= 0:
                raise InvalidOrderError("INVALID_QUANTITY", "Line quantity must be a positive integer")
            if not isinstance(line.unit_price_cents, int) or line.unit_price_cents < 0:
                raise InvalidOrderError("INVALID_UNIT_PRICE", "Unit price must be a non-negative integer (cents)")

    @classmethod
    def create(cls, id: str, customer_id: str, lines: list[OrderLine]) -> Order:
        return cls(id=id, customer_id=customer_id, lines=tuple(lines), status="PENDING")

    @classmethod
    def reconstitute(cls, id: str, customer_id: str, lines: list[OrderLine], status: OrderStatus) -> Order:
        return cls(id=id, customer_id=customer_id, lines=tuple(lines), status=status)

    @property
    def total_cents(self) -> int:
        return sum(line.quantity * line.unit_price_cents for line in self.lines)

    def can_be_cancelled(self) -> bool:
        """Critical Business Rule."""
        return self.status == "PENDING"
