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
