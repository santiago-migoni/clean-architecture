SELECT COALESCE(SUM(points), 0) FROM loyalty_awards WHERE customer_id = ?;
