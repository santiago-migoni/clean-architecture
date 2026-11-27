import pytest

from shop.modules.orders.domain.errors import InvalidOrderError
from shop.modules.orders.domain.order import Order, OrderLine

LINE = OrderLine("p-1", 2, 1250)


def test_starts_pending_and_totals_its_lines():
    order = Order.create("o-1", "c-1", [LINE, OrderLine("p-2", 1, 500)])
    assert (order.status, order.total_cents, order.can_be_cancelled()) == ("PENDING", 3000, True)


@pytest.mark.parametrize(
    "customer_id, lines",
    [("", [LINE]), ("c-1", []), ("c-1", [OrderLine("", 1, 1)]), ("c-1", [OrderLine("p", 0, 1)]), ("c-1", [OrderLine("p", 1, -1)])],
)
def test_rejects_an_invalid_order(customer_id, lines):
    with pytest.raises(InvalidOrderError):
        Order.create("o-1", customer_id, lines)


def test_a_cancelled_order_cannot_be_cancelled_again():
    assert not Order.reconstitute("o-1", "c-1", [LINE], "CANCELLED").can_be_cancelled()
