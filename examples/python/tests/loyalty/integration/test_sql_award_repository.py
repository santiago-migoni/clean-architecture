import sqlite3

from shop.main.compose.loyalty import MIGRATIONS
from shop.modules.loyalty.domain.points_award import PointsAward
from shop.modules.loyalty.infrastructure.gateways.sql_award_repository import SqlAwardRepository
from shop.platform.db.migrate import run_migrations


def repository():
    db = sqlite3.connect(":memory:")
    run_migrations(db, MIGRATIONS)  # loyalty's own tables only: it needs none of another module's
    return SqlAwardRepository(db)


def test_adds_up_the_points_of_a_customer_and_0_for_an_unknown_one():
    repo = repository()
    repo.add(PointsAward.for_order("o-1", "c-1", 1750))
    repo.add(PointsAward.for_order("o-2", "c-1", 500))
    repo.add(PointsAward.for_order("o-3", "c-2", 9900))
    assert (repo.points_of("c-1"), repo.points_of("ghost")) == (22, 0)


def test_ignores_a_second_award_for_the_same_order_never_added_never_replaced():
    repo = repository()
    assert repo.add(PointsAward.for_order("o-1", "c-1", 1000)) is True
    assert repo.add(PointsAward.for_order("o-1", "c-1", 99900)) is False
    assert repo.points_of("c-1") == 10
