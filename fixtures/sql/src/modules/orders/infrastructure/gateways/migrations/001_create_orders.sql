-- Owned by the orders module. customer_id is a plain id: no foreign key to the customers
-- table, because modules never share tables (orders refers to customers by id only).
CREATE TABLE orders (
  id          TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'placed'
);

CREATE TABLE order_lines (
  order_id         TEXT    NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  position         INTEGER NOT NULL,
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL,
  PRIMARY KEY (order_id, position)
);
