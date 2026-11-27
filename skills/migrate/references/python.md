# Migration steps — Python

Each phase keeps the application working: the old code first **delegates** to the new piece, and is deleted only when nothing calls it any more (strangler fig). Old code: `app/services.py`, `app/models.py` (Django, Flask-SQLAlchemy…); new code: `src/shop/modules/orders/`.

## Phase 1 — extract the business rule into an entity

```python
# BEFORE — app/services.py: the rule lives in a service, on an ORM row
class OrderService:
    def can_cancel(self, order_row) -> bool:
        return order_row.status == "PENDING" and len(order_row.items) > 0
```

```python
# AFTER — the rule moves to the entity; the service keeps its signature and delegates
from shop.modules.orders.domain.order import Order, OrderLine


class OrderService:
    def can_cancel(self, order_row) -> bool:
        order = Order.reconstitute(
            id=order_row.id,
            customer_id=order_row.customer_id,
            lines=[OrderLine(i.sku, i.qty, i.price_cents) for i in order_row.items],
            status=order_row.status,
        )
        return order.can_be_cancelled()
```

## Phase 2 — declare the ports

```python
# src/shop/modules/orders/application/ports/output/order_repository.py
from typing import Optional, Protocol

from ....domain.order import Order


class OrderRepository(Protocol):
    def find_by_id(self, order_id: str) -> Optional[Order]: ...

    def save(self, order: Order) -> None: ...
```

A `Protocol` needs no change in the existing data-access class to be satisfied; add a mapper so it returns entities instead of ORM rows.

## Phase 3 — move the use case into an interactor, the service delegates

```python
# app/services.py — now a thin facade kept for existing callers
from shop.modules.orders.application.interactors.place_order import PlaceOrderInteractor, PlaceOrderRequest


class OrderServiceFacade:
    def __init__(self, place_order: PlaceOrderInteractor) -> None:
        self._place_order = place_order

    def place(self, request: PlaceOrderRequest):
        return self._place_order.execute(request)  # delete the facade when callers use the interactor
```

## Phase 4 — wrap the existing ORM access in a gateway

```python
# src/shop/modules/orders/infrastructure/gateways/sqlalchemy_order_repository.py
from typing import Optional

from sqlalchemy.orm import Session

from ...domain.order import Order
from .order_record import OrderRecord, to_domain, to_record  # the ORM model lives in infrastructure


class SqlAlchemyOrderRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def find_by_id(self, order_id: str) -> Optional[Order]:
        record = self._session.get(OrderRecord, order_id)
        return to_domain(record) if record else None

    def save(self, order: Order) -> None:
        self._session.merge(to_record(order))  # an upsert by primary key
        self._session.commit()
```

The declarative model (`class OrderRecord(Base)`) moves from `app/models.py` to `infrastructure/gateways/`; the domain entity never inherits from the ORM base.

## Phase 7 — enforcement

Run `ca-scan` in CI, and optionally import-linter (both in the `init` skill's Python reference): it checks both axes and SQL table ownership. While a module is half-migrated, its warnings show what is left.
