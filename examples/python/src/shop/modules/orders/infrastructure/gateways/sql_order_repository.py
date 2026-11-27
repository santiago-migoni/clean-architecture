import sqlite3
from typing import Optional

from ...domain.order import Order
from .order_persistence_model import OrderLineRow, OrderRow, to_domain, to_rows


class SqlOrderRepository:
    def __init__(self, connection: sqlite3.Connection) -> None:
        self._db = connection

    def find_by_id(self, order_id: str) -> Optional[Order]:
        row = self._db.execute("SELECT id, customer_id, status FROM orders WHERE id = ?", (order_id,)).fetchone()
        if row is None:
            return None
        lines = self._db.execute(
            "SELECT order_id, position, product_id, quantity, unit_price_cents FROM order_lines "
            "WHERE order_id = ? ORDER BY position",
            (order_id,),
        ).fetchall()
        return to_domain(OrderRow(*row), [OrderLineRow(*l) for l in lines])

    def save(self, order: Order) -> None:
        row, lines = to_rows(order)
        with self._db:  # one transaction: the order and its lines
            self._db.execute(
                "INSERT INTO orders (id, customer_id, status) VALUES (?, ?, ?) "
                "ON CONFLICT (id) DO UPDATE SET customer_id = excluded.customer_id, status = excluded.status",
                row,
            )
            self._db.execute("DELETE FROM order_lines WHERE order_id = ?", (row.id,))
            self._db.executemany(
                "INSERT INTO order_lines (order_id, position, product_id, quantity, unit_price_cents) VALUES (?, ?, ?, ?, ?)",
                lines,
            )
