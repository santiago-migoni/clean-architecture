"""The connection is created in platform/db and injected by main: this gateway never imports platform."""
import sqlite3
from typing import Optional

from ...application.errors import EmailAlreadyRegisteredError
from ...domain.customer import Customer
from .customer_persistence_model import CustomerRow, to_domain, to_row


class SqlCustomerRepository:
    def __init__(self, connection: sqlite3.Connection) -> None:
        self._db = connection

    def find_by_id(self, customer_id: str) -> Optional[Customer]:
        row = self._db.execute("SELECT id, name, email FROM customers WHERE id = ?", (customer_id,)).fetchone()
        return to_domain(CustomerRow(*row)) if row else None

    def save(self, customer: Customer) -> None:
        row = to_row(customer)
        try:
            with self._db:  # one transaction
                # Upsert by id. NEVER "INSERT OR REPLACE": it would delete another customer with the same email.
                self._db.execute(
                    "INSERT INTO customers (id, name, email) VALUES (?, ?, ?) "
                    "ON CONFLICT (id) DO UPDATE SET name = excluded.name, email = excluded.email",
                    row,
                )
        except sqlite3.IntegrityError as error:
            # Translate the driver's error into the one the port declares (anti-corruption).
            if "customers.email" in str(error):
                raise EmailAlreadyRegisteredError(row.email) from error
            raise
