import type { DatabaseSync } from 'node:sqlite';
import type { IAwardRepository } from '../../application/ports/output/award-repository';
import type { PointsAward } from '../../domain/points-award';

export class SqlAwardRepository implements IAwardRepository {
  constructor(private readonly db: DatabaseSync) {}

  async add(award: PointsAward): Promise<boolean> {
    // ON CONFLICT DO NOTHING: a second award for the same order is ignored, never added and never replaced.
    const result = this.db
      .prepare('INSERT INTO loyalty_awards (order_id, customer_id, points) VALUES (?, ?, ?) ON CONFLICT(order_id) DO NOTHING')
      .run(award.orderId, award.customerId, award.points);
    return Number(result.changes) === 1;
  }

  async pointsOf(customerId: string): Promise<number> {
    const row = this.db.prepare('SELECT COALESCE(SUM(points), 0) AS points FROM loyalty_awards WHERE customer_id = ?').get(customerId) as unknown as { points: number };
    return Number(row.points);
  }
}
