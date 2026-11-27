# Gateway — SQL (migrations and queries)

SQL lives only in the module's `infrastructure/` (queries in `gateways/`, schema changes in `gateways/migrations/`) and in `platform/db/` (the connection, the migration runner and its bookkeeping table). `ca_scan` enforces both rules below, in `.sql` files and in SQL inside string literals.

## Each module owns its tables

A table belongs to the module whose migrations create it. Another module never queries, alters or adds a foreign key to it: it asks through the owner's input port, or keeps its own copy of the data it needs. Store the other entity's id **without** a foreign key.

```sql
-- src/modules/orders/infrastructure/gateways/migrations/001-create-orders.sql
-- Owned by the orders module. customer_id is a plain id: no foreign key to customers.
CREATE TABLE orders (
  id          TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  status      TEXT NOT NULL
);

-- A foreign key inside the module is fine: order_lines belongs to orders too.
CREATE TABLE order_lines (
  order_id         TEXT    NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  position         INTEGER NOT NULL,
  product_id       TEXT    NOT NULL,
  quantity         INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  PRIMARY KEY (order_id, position)
);
```

Reported by `ca_scan` (`table-ownership`): `SELECT … FROM orders JOIN customers …` in the orders module, `ALTER TABLE orders ADD COLUMN buyer_id TEXT REFERENCES customers (id)`, or a second module creating `orders`.

## Migrations

- One folder per module, files ordered by a numeric prefix (`001-…`, `002-…`); never edit an applied migration, add a new one.
- The runner in `platform/db/` applies every module's migrations in one list that the composition root builds; the runner knows nothing about modules.
- Timestamps the domain does not track: let the database fill them (`created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`) and leave them out of the upsert's update list.

## Upsert by id, never REPLACE

```sql
-- A conflict on ANY unique constraint makes REPLACE delete the other row: a second customer with an
-- existing email would silently destroy the first one. Upsert by the primary key instead, so a different
-- row with the same unique value fails with a constraint error the gateway can translate.
INSERT INTO customers (id, name, email) VALUES (?, ?, ?)
ON CONFLICT (id) DO UPDATE SET name = excluded.name, email = excluded.email;
```

MySQL: `INSERT … ON DUPLICATE KEY UPDATE`, which also fires on other unique keys, so check the affected row or use an explicit `UPDATE` then `INSERT`.

## Queries in files (sqlc, aiosql, yesql)

When queries live in `.sql` files, they go in the owning module's `infrastructure/gateways/queries/`, one file per aggregate, and use only that module's tables:

```sql
-- src/modules/orders/infrastructure/gateways/queries/orders.sql
-- name: GetOrderTotal :one
SELECT o.id, o.status, coalesce(sum(l.quantity * l.unit_price_cents), 0) AS total_cents
FROM orders AS o
LEFT JOIN order_lines AS l ON l.order_id = o.id
WHERE o.id = ?
GROUP BY o.id, o.status;
```
