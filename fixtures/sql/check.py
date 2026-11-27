"""Proves the fixture is real SQL: every migration applies on SQLite and every query compiles (EXPLAIN)."""
import pathlib
import sqlite3

root = pathlib.Path(__file__).parent / "src"
db = sqlite3.connect(":memory:")
for path in sorted(root.rglob("migrations/*.sql"), key=lambda p: p.name):
    db.executescript(path.read_text())
queries = 0
for path in sorted(root.rglob("queries/*.sql")):
    for statement in path.read_text().split(";\n"):
        body = "\n".join(l for l in statement.splitlines() if not l.strip().startswith("--")).strip()
        if body:
            db.execute("EXPLAIN " + body, [None] * body.count("?"))
            queries += 1
print(f"ok: {len(list(root.rglob('migrations/*.sql')))} migrations, {queries} queries")
