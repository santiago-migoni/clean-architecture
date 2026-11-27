"""The points a customer has.

A customer loyalty never heard of has 0: loyalty does not ask the customers module whether the customer exists, and it
may not have received an order event yet.
"""
from dataclasses import dataclass

from ..ports.output.award_repository import AwardRepository


@dataclass(frozen=True)
class GetPointsResponse:
    customer_id: str
    points: int


class GetPointsInteractor:
    def __init__(self, awards: AwardRepository) -> None:
        self._awards = awards

    def execute(self, customer_id: str) -> GetPointsResponse:
        return GetPointsResponse(customer_id, self._awards.points_of(customer_id))
