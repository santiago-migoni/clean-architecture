# SOLID fixes — Python

Before/after for the three principles whose fixes are structural. SRP and LSP are judgments (the actor test, the substitution test), shown in the skill itself.

## OCP — a strategy per variant instead of a type switch

```python
# Violation: every new payment method edits this function.
def process_payment(kind: str, amount_cents: int) -> str:
    if kind == "credit":
        return f"card:{amount_cents}"
    if kind == "paypal":
        return f"paypal:{amount_cents}"
    raise ValueError(f"unknown payment type {kind}")
```

```python
# Fix: open for extension. Strategies are registered in main and selected by key.
from typing import Mapping, Protocol


class PaymentStrategy(Protocol):
    def process(self, amount_cents: int) -> str: ...


class UnsupportedPaymentMethodError(LookupError):
    pass


class ProcessPaymentInteractor:
    def __init__(self, strategies: Mapping[str, PaymentStrategy]) -> None:
        self._strategies = strategies

    def execute(self, method: str, amount_cents: int) -> str:
        strategy = self._strategies.get(method)
        if strategy is None:
            raise UnsupportedPaymentMethodError(method)
        return strategy.process(amount_cents)
```

## ISP — role protocols instead of one fat repository

```python
# Violation: every use case depends on reporting and deletion it never calls.
from typing import Optional, Protocol


class Customer:
    id: str


class CustomerRepository(Protocol):
    def find_by_id(self, customer_id: str) -> Optional[Customer]: ...
    def save(self, customer: Customer) -> None: ...
    def delete(self, customer_id: str) -> None: ...
    def monthly_signup_report(self) -> str: ...


# Fix: each use case declares only what it uses; one gateway may satisfy several.
class CustomerReader(Protocol):
    def find_by_id(self, customer_id: str) -> Optional[Customer]: ...


class CustomerWriter(Protocol):
    def save(self, customer: Customer) -> None: ...
```

## DIP — inject the abstraction, construct the detail in main

```python
from typing import Protocol


class Order:
    id: str


# Violation: the use case constructs its database gateway (application → infrastructure).
class PlaceOrderBefore:
    def execute(self, order: Order) -> None:
        from shop.modules.orders.infrastructure.gateways.postgres_order_repository import PostgresOrderRepository

        PostgresOrderRepository().save(order)


# Fix: the use case depends on its own port; main passes the implementation in.
class OrderRepository(Protocol):
    def save(self, order: Order) -> None: ...


class PlaceOrder:
    def __init__(self, orders: OrderRepository) -> None:
        self._orders = orders

    def execute(self, order: Order) -> None:
        self._orders.save(order)
```
