# Entity — Python

The complete, tested version of this code is [`examples/python`](../../../examples/python): the same application in every language.

Files: `src/<package>/modules/<module>/domain/<entity>.py`, snake_case (`order.py`, `order_line.py`). Domain errors in `domain/errors.py` (or `domain/errors/` once there are several). Dataclasses keep entities plain; `frozen=True` for value objects.

## Entity

```python
# src/shop/modules/orders/domain/order.py
# Layer: domain. May import only shop.shared. The customer is referenced by id only.
from __future__ import annotations

from dataclasses import dataclass, field, replace
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
    status: OrderStatus = field(default="PENDING")

    def __post_init__(self) -> None:
        # Runs on create() and reconstitute() alike: stored data must satisfy the same invariants.
        if not self.customer_id.strip():
            raise InvalidOrderError("CUSTOMER_REQUIRED", "Order must reference a customer")
        if not self.lines:
            raise InvalidOrderError("NO_LINES", "Order must have at least one line")
        for line in self.lines:
            if line.quantity <= 0:
                raise InvalidOrderError("INVALID_QUANTITY", "Line quantity must be a positive integer")
            if line.unit_price_cents < 0:
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

    # Critical Business Rule
    def can_be_cancelled(self) -> bool:
        return self.status == "PENDING"

    def cancel(self) -> Order:
        if not self.can_be_cancelled():
            raise InvalidOrderError("NOT_CANCELLABLE", f"Order {self.id} cannot be cancelled")
        return replace(self, status="CANCELLED")
```

Equality: a frozen dataclass compares every field. When identity is what matters, define `__eq__` and `__hash__` on `id` only.

## Domain error

The error carries a **reason**: a stable code the outer layers map to a status and translate for users. Its message
is for logs, in one language; it is never shown as it is.

```python
# src/shop/modules/orders/domain/errors.py
from typing import Literal

InvalidOrderReason = Literal["CUSTOMER_REQUIRED", "NO_LINES", "INVALID_QUANTITY", "INVALID_UNIT_PRICE", "NOT_CANCELLABLE"]


class InvalidOrderError(ValueError):
    """A rule of the Order aggregate was violated. Mapped by the outer layers by type and reason."""

    def __init__(self, reason: InvalidOrderReason, message: str) -> None:
        super().__init__(message)  # for logs; users get the text of the reason, in their language
        self.reason = reason
```

## Value object

```python
# src/shop/shared/money.py
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Money:
    cents: int
    currency: str

    def __post_init__(self) -> None:
        if not isinstance(self.cents, int):
            raise TypeError("Money is an integer amount of cents")
        object.__setattr__(self, "currency", self.currency.upper())

    def add(self, other: Money) -> Money:
        if other.currency != self.currency:
            raise ValueError(f"Cannot add {other.currency} to {self.currency}")
        return Money(self.cents + other.cents, self.currency)
```

## Test

```python
# tests/orders/unit/domain/test_order.py — no mocks: the entity is pure
import pytest

from shop.modules.orders.domain.errors import InvalidOrderError
from shop.modules.orders.domain.order import Order, OrderLine

LINE = OrderLine(product_id="p-1", quantity=2, unit_price_cents=1250)


def test_starts_pending_and_totals_its_lines():
    order = Order.create("o-1", "c-1", [LINE])
    assert order.status == "PENDING"
    assert order.total_cents == 2500
    assert order.can_be_cancelled()


def test_rejects_an_order_without_lines():
    with pytest.raises(InvalidOrderError):
        Order.create("o-1", "c-1", [])
```
