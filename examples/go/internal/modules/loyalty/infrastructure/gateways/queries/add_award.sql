-- ON CONFLICT DO NOTHING: a second award for the same order is ignored, never added and never replaced.
INSERT INTO loyalty_awards (order_id, customer_id, points) VALUES (?, ?, ?) ON CONFLICT (order_id) DO NOTHING;
