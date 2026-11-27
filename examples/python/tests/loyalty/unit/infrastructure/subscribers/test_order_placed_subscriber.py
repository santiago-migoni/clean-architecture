from shop.modules.loyalty.application.interactors.award_points import AwardPointsRequest
from shop.modules.loyalty.infrastructure.subscribers.order_placed_subscriber import OrderPlacedSubscriber
from shop.modules.orders.application.ports.published.order_placed_v1 import OrderPlacedV1


def test_translates_orders_event_into_loyaltys_own_request():
    class AwardPoints:
        requests = []

        def execute(self, request):
            self.requests.append(request)

    use_case = AwardPoints()
    OrderPlacedSubscriber(use_case).handle(OrderPlacedV1("o-1", "c-1", 1750))
    assert use_case.requests == [AwardPointsRequest("o-1", "c-1", 1750)]
