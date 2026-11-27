import sqlite3

from shop.main.compose.orders import MIGRATIONS
from shop.modules.orders.domain.order import Order, OrderLine
from shop.modules.orders.infrastructure.gateways.sql_order_repository import SqlOrderRepository
from shop.platform.db.migrate import run_migrations


def repository():
    db = sqlite3.connect(":memory:")
    run_migrations(db, MIGRATIONS)
    return SqlOrderRepository(db)


def test_round_trips_an_order_with_its_lines_in_order():
    repo = repository()
    repo.save(Order.create("o-1", "c-1", [OrderLine("p1", 2, 1000), OrderLine("p2", 1, 250)]))
    found = repo.find_by_id("o-1")
    assert [l.product_id for l in found.lines] == ["p1", "p2"] and found.total_cents == 2250


def test_saving_again_replaces_the_lines_instead_of_duplicating_them():
    repo = repository()
    repo.save(Order.create("o-1", "c-1", [OrderLine("p1", 2, 1000)]))
    repo.save(Order.create("o-1", "c-1", [OrderLine("p3", 1, 100)]))
    assert [l.product_id for l in repo.find_by_id("o-1").lines] == ["p3"]


def test_returns_none_for_a_missing_id():
    assert repository().find_by_id("missing") is None
