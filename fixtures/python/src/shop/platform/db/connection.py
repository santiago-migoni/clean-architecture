"""Driver: the database connection. Created here, injected from main/."""
import sqlite3


def connect(path: str = ":memory:") -> sqlite3.Connection:
    return sqlite3.connect(path)
