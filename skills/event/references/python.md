# Event — Python

The complete, tested version of this code is [`examples/python`](../../../examples/python): the same application in every language.

Files: the contract in `src/<package>/modules/<a>/application/ports/published/<event>_v<n>.py`, the publishing adapter in `src/<package>/modules/<a>/infrastructure/gateways/`, the subscriber in `src/<package>/modules/<b>/infrastructure/subscribers/<event>_subscriber.py`, the bus in `src/<package>/platform/events/`. Here `orders` publishes `OrderPlaced` and `loyalty` awards points for it.

## The published contract (orders)

```python
# src/shop/modules/orders/application/ports/published/order_placed_v1.py
"""A PUBLISHED CONTRACT (integration event): what `orders` announces to other modules.

Part of the module's public surface, like application/ports/input. Plain, versioned data: it imports nothing, so a
subscriber depends on this file only, never on orders' domain. A change that breaks a subscriber is a new version
(v2), published beside v1.
"""
from dataclasses import dataclass

ORDER_PLACED_V1 = "orders.order-placed.v1"


@dataclass(frozen=True)
class OrderPlacedV1:
    order_id: str
    customer_id: str
    total_cents: int
    type: str = ORDER_PLACED_V1
```

## The publishing adapter (orders)

The use case publishes the domain event through its own port (`OrderEvents`); this adapter maps it to the contract.

```python
# src/shop/modules/orders/infrastructure/gateways/published_order_events.py
"""Implements OrderEvents by publishing each domain event as orders' integration event.

It maps the domain event (orders' own vocabulary) to the published contract (what other modules may rely on). The bus
is injected by main as a function: this adapter never imports platform.
"""
from typing import Callable

from ...application.ports.published.order_placed_v1 import OrderPlacedV1
from ...domain.events.order_placed import OrderPlaced


class PublishedOrderEvents:
    def __init__(self, send: Callable[[OrderPlacedV1], None]) -> None:
        self._send = send

    def publish(self, event: OrderPlaced) -> None:
        self._send(OrderPlacedV1(order_id=event.order_id, customer_id=event.customer_id, total_cents=event.total_cents))
```

## The subscriber (loyalty)

```python
# src/shop/modules/loyalty/infrastructure/subscribers/order_placed_subscriber.py
"""A driving adapter, like a controller: it turns orders' integration event into loyalty's own request.

Importing orders' PUBLISHED CONTRACT is the second legal crossing between modules (the first is a call to another
module's ports/input); orders never knows that loyalty exists.
"""
from shop.modules.orders.application.ports.published.order_placed_v1 import OrderPlacedV1

from ...application.interactors.award_points import AwardPointsInteractor, AwardPointsRequest


class OrderPlacedSubscriber:
    def __init__(self, award_points: AwardPointsInteractor) -> None:
        self._award_points = award_points

    def handle(self, event: OrderPlacedV1) -> None:
        self._award_points.execute(AwardPointsRequest(event.order_id, event.customer_id, event.total_cents))
```

Loyalty's own use case, idempotent by order: the repository's `add` returns `False` for an order already awarded (a primary key on `order_id` in SQL, `ON CONFLICT DO NOTHING`).

```python
# src/shop/modules/loyalty/application/interactors/award_points.py
"""Awards the points of one placed order.

It knows nothing of how it is called (an event, a command line, a backfill script): the subscriber in infrastructure
translates orders' event into this request.
"""
from dataclasses import dataclass

from ...domain.points_award import PointsAward
from ..ports.output.award_repository import AwardRepository


@dataclass(frozen=True)
class AwardPointsRequest:
    order_id: str
    customer_id: str
    total_cents: int


@dataclass(frozen=True)
class AwardPointsResponse:
    awarded: bool  # False when this order had already been awarded
    points: int  # the points of this order


class AwardPointsInteractor:
    def __init__(self, awards: AwardRepository) -> None:
        self._awards = awards

    def execute(self, request: AwardPointsRequest) -> AwardPointsResponse:
        award = PointsAward.for_order(request.order_id, request.customer_id, request.total_cents)
        return AwardPointsResponse(awarded=self._awards.add(award), points=award.points)  # idempotent per order
```

## The bus (platform/events)

```python
# src/shop/platform/events/in_process_bus.py
"""Delivers integration events to the subscribers main registered, in the same process. A driver, like the database:
replacing it with a broker (and an outbox) changes no module.

Delivery is synchronous and in order, after the publisher stored its change. A subscriber that fails is reported and
never fails the publisher: the order is placed whatever loyalty does. There is no retry: an event whose subscriber
failed is lost for that subscriber (at most once). An outbox, written in the same transaction as the change and
published afterwards, is what makes it at least once.
"""
from collections import defaultdict
from typing import Any, Callable

Handler = Callable[[Any], None]  # an event is any object with a `type` attribute


class InProcessBus:
    def __init__(self, on_error: Callable[[Exception, Any], None]) -> None:
        self._on_error = on_error
        self._by_type: dict[str, list[Handler]] = defaultdict(list)
        self._all: list[Handler] = []

    def subscribe(self, event_type: str, handler: Handler) -> None:
        self._by_type[event_type].append(handler)

    def subscribe_all(self, handler: Handler) -> None:
        """Every event, whatever its type: an audit log, a tracer."""
        self._all.append(handler)

    def publish(self, event: Any) -> None:
        for handler in [*self._by_type.get(event.type, []), *self._all]:
            try:
                handler(event)
            except Exception as error:  # noqa: BLE001 — a subscriber never fails the publisher
                self._on_error(error, event)
```

## The wiring (main)

```python
# src/shop/main/app.py (excerpt) — the only place that knows the bus, the publisher and the subscribers
import json
import logging
from dataclasses import asdict

from shop.main.compose import loyalty as loyalty_composition
from shop.main.compose import orders as orders_composition
from shop.modules.loyalty.infrastructure.gateways.sql_award_repository import SqlAwardRepository
from shop.modules.orders.application.ports.published.order_placed_v1 import ORDER_PLACED_V1
from shop.platform.events.in_process_bus import InProcessBus


def wire(db, new_id, get_customer, audit_log):
    bus = InProcessBus(lambda error, event: logging.getLogger("shop").error("Subscriber failed on %s", event.type, exc_info=error))
    make_place_order = orders_composition.compose_orders(db, new_id, get_customer, bus.publish, "en")  # orders announces
    loyalty = loyalty_composition.compose_loyalty(SqlAwardRepository(db))
    bus.subscribe(ORDER_PLACED_V1, loyalty.order_placed.handle)  # loyalty reacts
    bus.subscribe_all(lambda event: audit_log(json.dumps(asdict(event))))  # every integration event
    return make_place_order, loyalty.get_points
```

## Tests

```python
# tests/orders/unit/infrastructure/gateways/test_published_order_events.py
from shop.modules.orders.application.ports.published.order_placed_v1 import OrderPlacedV1
from shop.modules.orders.domain.events.order_placed import OrderPlaced
from shop.modules.orders.infrastructure.gateways.published_order_events import PublishedOrderEvents


def test_maps_the_domain_event_to_the_published_contract_and_publishes_it():
    sent = []
    PublishedOrderEvents(sent.append).publish(OrderPlaced("o-1", "c-1", 2500))
    assert sent == [OrderPlacedV1(order_id="o-1", customer_id="c-1", total_cents=2500)]
    assert sent[0].type == "orders.order-placed.v1"
```

```python
# tests/loyalty/unit/application/test_loyalty_use_cases.py (excerpt)
from shop.modules.loyalty.application.interactors.award_points import AwardPointsInteractor, AwardPointsRequest, AwardPointsResponse
from shop.modules.loyalty.infrastructure.gateways.in_memory.award_in_memory_repository import AwardInMemoryRepository


def test_counts_an_order_once_however_many_times_its_event_arrives():
    awards = AwardInMemoryRepository()
    award = AwardPointsInteractor(awards)
    award.execute(AwardPointsRequest("o-1", "c-1", 1000))
    assert award.execute(AwardPointsRequest("o-1", "c-1", 1000)) == AwardPointsResponse(awarded=False, points=10)
    assert awards.points_of("c-1") == 10
```

```python
# tests/platform/test_in_process_bus.py
from dataclasses import dataclass

from shop.platform.events.in_process_bus import InProcessBus


@dataclass(frozen=True)
class Event:
    type: str


PLACED, OTHER = Event("orders.order-placed.v1"), Event("customers.customer-registered.v1")


def test_delivers_to_the_subscribers_of_its_type_in_order_and_to_every_catch_all_subscriber():
    bus, seen = InProcessBus(lambda error, event: None), []
    bus.subscribe(PLACED.type, lambda e: seen.append("first"))
    bus.subscribe(PLACED.type, lambda e: seen.append("second"))
    bus.subscribe_all(lambda e: seen.append(f"all:{e.type}"))
    bus.publish(PLACED)
    bus.publish(OTHER)
    assert seen == ["first", "second", "all:orders.order-placed.v1", "all:customers.customer-registered.v1"]


def test_a_failing_subscriber_is_reported_and_never_stops_the_others_nor_fails_the_publisher():
    errors, after = [], []
    bus = InProcessBus(lambda error, event: errors.append((error, event)))
    boom = RuntimeError("loyalty is down")

    def failing(_):
        raise boom

    bus.subscribe(PLACED.type, failing)
    bus.subscribe(PLACED.type, after.append)
    bus.publish(PLACED)  # does not raise
    assert errors == [(boom, PLACED)] and after == [PLACED]
```
