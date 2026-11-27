"""Frameworks & drivers: creates the database connection; main injects it into the gateways."""
import sqlite3


def connect(path: str = ":memory:") -> sqlite3.Connection:
    # One connection shared by the app. The handlers run on the server's event loop, one at a time.
    connection = sqlite3.connect(path, check_same_thread=False)
    connection.execute("PRAGMA foreign_keys = ON")
    return connection
