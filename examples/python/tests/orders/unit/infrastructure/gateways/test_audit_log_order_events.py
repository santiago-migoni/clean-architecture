import json

from shop.modules.orders.domain.events.order_placed import OrderPlaced
from shop.modules.orders.infrastructure.gateways.audit_log_order_events import AuditLogOrderEvents


def test_writes_one_json_line_per_event_to_the_injected_sink():
    lines = []
    AuditLogOrderEvents(lines.append).publish(OrderPlaced("o-1", "c-1", 2500))
    assert [json.loads(l) for l in lines] == [{"order_id": "o-1", "customer_id": "c-1", "total_cents": 2500, "type": "OrderPlaced"}]
