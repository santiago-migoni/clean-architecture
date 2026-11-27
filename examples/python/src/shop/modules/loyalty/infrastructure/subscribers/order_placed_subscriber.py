"""A driving adapter, like a controller: it turns orders' integration event into loyalty's own request.

Importing orders' PUBLISHED CONTRACT is the second legal crossing between modules (the first is a call to another
module's ports/input); orders never knows that loyalty exists.
"""
from shop.modules.orders.application.ports.published.order_placed_v1 import OrderPlacedV1

from ...application.interactors.award_points import AwardPointsInteractor, AwardPointsRequest


class OrderPlacedSubscriber:
    def __init__(self, award_points: AwardPointsInteractor) -> None:
        self._award_points = award_points

    def handle(self, event: OrderPlacedV1) -> None:
        self._award_points.execute(AwardPointsRequest(event.order_id, event.customer_id, event.total_cents))
