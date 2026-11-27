-- Owned by the orders module. No foreign key to customers: modules never share tables.
CREATE TABLE orders (
  id          TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  status      TEXT NOT NULL
);

CREATE TABLE order_lines (
  order_id         TEXT    NOT NULL REFERENCES orders (id),
  position         INTEGER NOT NULL,
  product_id       TEXT    NOT NULL,
  quantity         INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  PRIMARY KEY (order_id, position)
);
