"""Generic migration runner. It knows nothing about modules: main hands it every module's migrations."""
import sqlite3
from dataclasses import dataclass


@dataclass(frozen=True)
class Migration:
    name: str
    sql: str


def run_migrations(db: sqlite3.Connection, migrations: list[Migration]) -> None:
    db.execute("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY)")
    applied = {name for (name,) in db.execute("SELECT name FROM schema_migrations")}
    for migration in migrations:
        if migration.name in applied:
            continue
        name = migration.name.replace("'", "''")
        # executescript runs the migration and its bookkeeping in one transaction.
        db.executescript(f"BEGIN; {migration.sql}; INSERT INTO schema_migrations (name) VALUES ('{name}'); COMMIT;")
