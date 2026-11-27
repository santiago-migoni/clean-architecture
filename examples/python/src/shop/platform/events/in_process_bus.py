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
