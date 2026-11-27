# Use case — Python

The complete, tested version of this code is [`examples/python`](../../../examples/python): the same application in every language.

Files, inside `src/<package>/modules/<module>/application/`: `interactors/<use_case>.py`, `ports/output/<port>.py`, `ports/input/<use_case>.py` (optional), `errors.py`. snake_case. Ports are `typing.Protocol`s: the gateway satisfies them structurally, without importing them. Request and response models are frozen dataclasses with primitive fields.

## Interactor — default flow (returns a response model)

```python
# src/shop/modules/orders/application/interactors/place_order.py
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from ...domain.order import Order, OrderLine
from ..errors import CustomerNotFoundError
from ..ports.output.customer_lookup import CustomerLookup
from ..ports.output.order_repository import OrderRepository


@dataclass(frozen=True)
class PlaceOrderLine:
    product_id: str
    quantity: int
    unit_price_cents: int


@dataclass(frozen=True)
class PlaceOrderRequest:
    customer_id: str
    lines: tuple[PlaceOrderLine, ...]


@dataclass(frozen=True)
class PlaceOrderResponse:
    order_id: str
    status: str
    total_cents: int


class PlaceOrderInteractor:
    def __init__(self, orders: OrderRepository, customers: CustomerLookup, new_id: Callable[[], str]) -> None:
        self._orders = orders
        self._customers = customers
        self._new_id = new_id  # injected: randomness does not belong in business rules

    def execute(self, request: PlaceOrderRequest) -> PlaceOrderResponse:
        # Enterprise rules first: a malformed order raises InvalidOrderError before asking another module.
        lines = [OrderLine(l.product_id, l.quantity, l.unit_price_cents) for l in request.lines]
        order = Order.create(self._new_id(), request.customer_id, lines)
        if not self._customers.exists(order.customer_id):
            raise CustomerNotFoundError(order.customer_id)
        self._orders.save(order)
        return PlaceOrderResponse(order.id, order.status, order.total_cents)
```

## Ports (output)

```python
# src/shop/modules/orders/application/ports/output/order_repository.py
from typing import Optional, Protocol

from ....domain.order import Order


class OrderRepository(Protocol):
    def find_by_id(self, order_id: str) -> Optional[Order]: ...

    def save(self, order: Order) -> None: ...
```

```python
# src/shop/modules/orders/application/ports/output/customer_lookup.py
# Owned by orders, in orders' vocabulary; implemented by a gateway that calls the customers INPUT port.
from typing import Protocol


class CustomerLookup(Protocol):
    def exists(self, customer_id: str) -> bool: ...
```

## Application error

```python
# src/shop/modules/orders/application/errors.py
class CustomerNotFoundError(LookupError):
    def __init__(self, customer_id: str) -> None:
        super().__init__(f"Customer {customer_id} not found")
        self.customer_id = customer_id
```

## Input Port (optional) — the module's public surface

```python
# src/shop/modules/customers/application/ports/input/get_customer.py
# The only thing another module's infrastructure may import from customers. Plain data only.
from dataclasses import dataclass
from typing import Optional, Protocol


@dataclass(frozen=True)
class CustomerView:
    id: str
    name: str
    email: str


class GetCustomer(Protocol):
    def execute(self, customer_id: str) -> Optional[CustomerView]: ...
```

## Output Port (optional)

When the output needs formatting, the interactor calls the port instead of returning, presents only the failures it declares and re-raises anything else.

```python
# src/shop/modules/orders/application/ports/output/place_order_output.py
from typing import Protocol

from ...interactors.place_order import PlaceOrderResponse


class PlaceOrderOutput(Protocol):
    def present(self, response: PlaceOrderResponse) -> None: ...

    def present_error(self, error: Exception) -> None: ...
```

```python
# src/shop/modules/orders/application/interactors/place_order_presented.py
# The same use case with an Output Port: it presents instead of returning.
from ...domain.errors import InvalidOrderError
from ..errors import CustomerNotFoundError
from ..ports.output.place_order_output import PlaceOrderOutput
from .place_order import PlaceOrderInteractor, PlaceOrderRequest


class PlaceOrderWithPresenter:
    def __init__(self, place_order: PlaceOrderInteractor, output: PlaceOrderOutput) -> None:
        self._place_order = place_order
        self._output = output

    def execute(self, request: PlaceOrderRequest) -> None:
        try:
            response = self._place_order.execute(request)
        except (CustomerNotFoundError, InvalidOrderError) as error:
            self._output.present_error(error)  # only the failures this use case declares
            return
        self._output.present(response)  # anything else propagates to the last-resort handler
```

In a real module there is one interactor: choose the returning or the presenting form, not both.

## Test — no database, the other module faked through this module's port

```python
# tests/orders/unit/application/test_place_order.py
import pytest

from shop.modules.orders.application.errors import CustomerNotFoundError
from shop.modules.orders.application.interactors.place_order import (
    PlaceOrderInteractor,
    PlaceOrderLine,
    PlaceOrderRequest,
)
from shop.modules.orders.infrastructure.gateways.in_memory.order_in_memory_repository import OrderInMemoryRepository


class StubCustomers:
    def __init__(self, existing: set[str]) -> None:
        self.existing = existing

    def exists(self, customer_id: str) -> bool:
        return customer_id in self.existing


REQUEST = PlaceOrderRequest("c-1", (PlaceOrderLine("p-1", 2, 1000),))


def test_places_an_order_for_an_existing_customer():
    orders = OrderInMemoryRepository()
    response = PlaceOrderInteractor(orders, StubCustomers({"c-1"}), lambda: "o-1").execute(REQUEST)
    assert (response.order_id, response.status, response.total_cents) == ("o-1", "PENDING", 2000)
    assert orders.find_by_id("o-1") is not None


def test_unknown_customer_raises_and_persists_nothing():
    orders = OrderInMemoryRepository()
    with pytest.raises(CustomerNotFoundError):
        PlaceOrderInteractor(orders, StubCustomers(set()), lambda: "o-1").execute(REQUEST)
    assert orders.find_by_id("o-1") is None
```
