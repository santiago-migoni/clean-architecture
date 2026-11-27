-- Upsert by id. NEVER "INSERT OR REPLACE": it would delete another customer with the same email.
INSERT INTO customers (id, name, email) VALUES (?, ?, ?)
ON CONFLICT (id) DO UPDATE SET name = excluded.name, email = excluded.email;
