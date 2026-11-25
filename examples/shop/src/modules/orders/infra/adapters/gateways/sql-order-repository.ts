// Layer: infra. Implements IOrderRepository (defined in this module's app layer).
// May import: this module's app/ports/output, domain, src/shared, third-party/built-in libs.
// MUST NOT import platform/: the DB connection is created in platform/db and injected from main/.
import type { DatabaseSync } from 'node:sqlite';
import { IOrderRepository } from '../../../app/ports/output/order-repository';
import { Order, OrderId } from '../../../domain/order';
import { OrderLineRow, OrderRow, toDomain, toPersistence } from './persistence/order-persistence-model';

export class SqlOrderRepository implements IOrderRepository {
  constructor(private readonly db: DatabaseSync) {}

  async findById(id: OrderId): Promise<Order | null> {
    const row = this.db.prepare('SELECT id, customer_id, status FROM orders WHERE id = ?').get(id) as unknown as OrderRow | undefined;
    if (!row) return null;
    const lines = this.db
      .prepare('SELECT order_id, position, product_id, quantity, unit_price_cents FROM order_lines WHERE order_id = ? ORDER BY position')
      .all(id) as unknown as OrderLineRow[];
    return toDomain(row, lines);
  }

  async save(order: Order): Promise<void> {
    const { order: row, lines } = toPersistence(order);
    this.db.exec('BEGIN');
    try {
      this.db.prepare('INSERT INTO orders (id, customer_id, status) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET customer_id = excluded.customer_id, status = excluded.status').run(row.id, row.customer_id, row.status);
      this.db.prepare('DELETE FROM order_lines WHERE order_id = ?').run(row.id);
      const insert = this.db.prepare('INSERT INTO order_lines (order_id, position, product_id, quantity, unit_price_cents) VALUES (?, ?, ?, ?, ?)');
      for (const l of lines) insert.run(l.order_id, l.position, l.product_id, l.quantity, l.unit_price_cents);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
}
