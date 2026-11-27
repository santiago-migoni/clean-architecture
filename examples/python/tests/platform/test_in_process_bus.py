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
