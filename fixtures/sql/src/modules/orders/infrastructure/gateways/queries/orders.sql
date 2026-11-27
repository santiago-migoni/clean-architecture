-- name: GetOrderTotal :one
WITH line_totals AS (
  SELECT order_id, quantity * unit_price_cents AS cents FROM order_lines WHERE order_id = ?
)
SELECT o.id, o.status, coalesce(sum(t.cents), 0) AS total_cents
FROM orders AS o
LEFT JOIN line_totals AS t ON t.order_id = o.id
WHERE o.id = ?
GROUP BY o.id, o.status;

-- name: UpsertOrder :exec
INSERT INTO orders (id, customer_id, status) VALUES (?, ?, ?)
ON CONFLICT (id) DO UPDATE SET status = excluded.status;

-- name: ReplaceLines :exec
DELETE FROM order_lines WHERE order_id = ?;

-- name: MarkReassigned :exec
-- The text in quotes is data, not a table: 'moved from customers' must not be read as SQL.
UPDATE orders SET status = 'moved from customers' WHERE id IN (SELECT value FROM json_each(?));
