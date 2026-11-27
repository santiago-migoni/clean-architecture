-- Owned by the `loyalty` module. order_id and customer_id are ids of other modules: no foreign key, modules never
-- share tables. The primary key on order_id is what makes an event delivered twice count once.
CREATE TABLE loyalty_awards (
  order_id    TEXT    PRIMARY KEY,
  customer_id TEXT    NOT NULL,
  points      INTEGER NOT NULL
);
CREATE INDEX loyalty_awards_by_customer ON loyalty_awards (customer_id);
