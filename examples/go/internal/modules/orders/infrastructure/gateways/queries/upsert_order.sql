INSERT INTO orders (id, customer_id, status) VALUES (?, ?, ?)
ON CONFLICT (id) DO UPDATE SET customer_id = excluded.customer_id, status = excluded.status;
