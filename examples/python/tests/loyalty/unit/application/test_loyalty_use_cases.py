from shop.modules.loyalty.application.interactors.award_points import AwardPointsInteractor, AwardPointsRequest, AwardPointsResponse
from shop.modules.loyalty.application.interactors.get_points import GetPointsInteractor, GetPointsResponse
from shop.modules.loyalty.infrastructure.gateways.in_memory.award_in_memory_repository import AwardInMemoryRepository


def test_awards_the_points_of_an_order_and_adds_them_up_per_customer():
    awards = AwardInMemoryRepository()
    award = AwardPointsInteractor(awards)
    assert award.execute(AwardPointsRequest("o-1", "c-1", 1750)) == AwardPointsResponse(awarded=True, points=17)
    award.execute(AwardPointsRequest("o-2", "c-1", 500))
    award.execute(AwardPointsRequest("o-3", "c-2", 9900))
    assert GetPointsInteractor(awards).execute("c-1") == GetPointsResponse("c-1", 22)


def test_counts_an_order_once_however_many_times_its_event_arrives():
    awards = AwardInMemoryRepository()
    award = AwardPointsInteractor(awards)
    award.execute(AwardPointsRequest("o-1", "c-1", 1000))
    assert award.execute(AwardPointsRequest("o-1", "c-1", 1000)) == AwardPointsResponse(awarded=False, points=10)
    assert awards.points_of("c-1") == 10


def test_answers_0_points_for_a_customer_it_never_heard_of():
    assert GetPointsInteractor(AwardInMemoryRepository()).execute("ghost") == GetPointsResponse("ghost", 0)
