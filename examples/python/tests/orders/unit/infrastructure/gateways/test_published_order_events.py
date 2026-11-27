from shop.modules.orders.application.ports.published.order_placed_v1 import OrderPlacedV1
from shop.modules.orders.domain.events.order_placed import OrderPlaced
from shop.modules.orders.infrastructure.gateways.published_order_events import PublishedOrderEvents


def test_maps_the_domain_event_to_the_published_contract_and_publishes_it():
    sent = []
    PublishedOrderEvents(sent.append).publish(OrderPlaced("o-1", "c-1", 2500))
    assert sent == [OrderPlacedV1(order_id="o-1", customer_id="c-1", total_cents=2500)]
    assert sent[0].type == "orders.order-placed.v1"
