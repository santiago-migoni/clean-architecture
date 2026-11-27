import pytest

from shop.modules.orders.domain.errors import InvalidOrderError
from shop.modules.orders.domain.order import Order, OrderLine

LINE = OrderLine("p-1", 2, 1250)


def test_starts_pending_and_totals_its_lines():
    order = Order.create("o-1", "c-1", [LINE, OrderLine("p-2", 1, 500)])
    assert (order.status, order.total_cents, order.can_be_cancelled()) == ("PENDING", 3000, True)


@pytest.mark.parametrize(
    "customer_id, lines, reason",
    [
        ("", [LINE], "CUSTOMER_REQUIRED"),
        ("c-1", [], "NO_LINES"),
        ("c-1", [OrderLine("", 1, 1)], "PRODUCT_REQUIRED"),
        ("c-1", [OrderLine("p", 0, 1)], "INVALID_QUANTITY"),
        ("c-1", [OrderLine("p", 1, -1)], "INVALID_UNIT_PRICE"),
    ],
)
def test_rejects_an_invalid_order_with_a_stable_reason(customer_id, lines, reason):
    with pytest.raises(InvalidOrderError) as raised:
        Order.create("o-1", customer_id, lines)
    assert raised.value.reason == reason


def test_a_cancelled_order_cannot_be_cancelled_again():
    assert not Order.reconstitute("o-1", "c-1", [LINE], "CANCELLED").can_be_cancelled()
