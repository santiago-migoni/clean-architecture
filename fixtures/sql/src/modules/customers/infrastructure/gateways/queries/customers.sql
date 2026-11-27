-- name: GetCustomer :one
SELECT id, name, email FROM customers WHERE id = ?;

-- name: UpsertCustomer :exec
INSERT INTO customers (id, name, email) VALUES (?, ?, ?)
ON CONFLICT (id) DO UPDATE SET name = excluded.name, email = excluded.email;
