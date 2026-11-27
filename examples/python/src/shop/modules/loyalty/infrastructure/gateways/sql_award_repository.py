"""The connection is created in platform/db and injected by main: this gateway never imports platform."""
import sqlite3

from ...domain.points_award import PointsAward


class SqlAwardRepository:
    def __init__(self, connection: sqlite3.Connection) -> None:
        self._db = connection

    def add(self, award: PointsAward) -> bool:
        with self._db:  # one transaction
            # ON CONFLICT DO NOTHING: a second award for the same order is ignored, never added and never replaced.
            cursor = self._db.execute(
                "INSERT INTO loyalty_awards (order_id, customer_id, points) VALUES (?, ?, ?) ON CONFLICT (order_id) DO NOTHING",
                (award.order_id, award.customer_id, award.points),
            )
        return cursor.rowcount == 1

    def points_of(self, customer_id: str) -> int:
        row = self._db.execute(
            "SELECT COALESCE(SUM(points), 0) FROM loyalty_awards WHERE customer_id = ?", (customer_id,)
        ).fetchone()
        return int(row[0])
