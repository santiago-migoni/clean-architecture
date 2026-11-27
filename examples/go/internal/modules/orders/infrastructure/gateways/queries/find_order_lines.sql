SELECT product_id, quantity, unit_price_cents FROM order_lines WHERE order_id = ? ORDER BY position;
