"""Rows of orders and order_lines, and the mapping to and from the aggregate."""
from typing import NamedTuple

from ...domain.order import Order, OrderLine


class OrderRow(NamedTuple):
    id: str
    customer_id: str
    status: str


class OrderLineRow(NamedTuple):
    order_id: str
    position: int
    product_id: str
    quantity: int
    unit_price_cents: int


def to_domain(row: OrderRow, lines: list[OrderLineRow]) -> Order:
    return Order.reconstitute(
        id=row.id,
        customer_id=row.customer_id,
        lines=[OrderLine(l.product_id, l.quantity, l.unit_price_cents) for l in lines],
        status=row.status,  # type: ignore[arg-type]
    )


def to_rows(order: Order) -> tuple[OrderRow, list[OrderLineRow]]:
    lines = [
        OrderLineRow(order.id, position, l.product_id, l.quantity, l.unit_price_cents)
        for position, l in enumerate(order.lines)
    ]
    return OrderRow(order.id, order.customer_id, order.status), lines
