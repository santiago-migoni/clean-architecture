import pytest

from shop.modules.loyalty.domain.errors import InvalidPointsAwardError
from shop.modules.loyalty.domain.points_award import PointsAward
from shop.shared.domain_error import DomainError


@pytest.mark.parametrize("cents, points", [(0, 0), (99, 0), (100, 1), (1750, 17), (123456, 1234)])
def test_one_point_per_whole_dollar(cents, points):
    assert PointsAward.for_order("o-1", "c-1", cents).points == points


@pytest.mark.parametrize(
    "order_id, customer_id, cents, reason",
    [("", "c-1", 100, "ORDER_REQUIRED"), ("o-1", " ", 100, "CUSTOMER_REQUIRED"), ("o-1", "c-1", -1, "INVALID_TOTAL"), ("o-1", "c-1", 1.5, "INVALID_TOTAL")],
)
def test_rejects_an_invalid_award_with_a_stable_reason(order_id, customer_id, cents, reason):
    with pytest.raises(InvalidPointsAwardError) as raised:
        PointsAward.for_order(order_id, customer_id, cents)
    assert raised.value.reason == reason


def test_the_domain_error_comes_from_the_shared_kernel():
    assert issubclass(InvalidPointsAwardError, DomainError)
