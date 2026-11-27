// Non-production implementation of IAwardRepository: the test composition root and the use case tests.
import type { IAwardRepository } from '../../../application/ports/output/award-repository';
import type { PointsAward } from '../../../domain/points-award';

export class AwardInMemoryRepository implements IAwardRepository {
  private readonly byOrder = new Map<string, PointsAward>();

  async add(award: PointsAward): Promise<boolean> {
    if (this.byOrder.has(award.orderId)) return false;
    this.byOrder.set(award.orderId, award);
    return true;
  }

  async pointsOf(customerId: string): Promise<number> {
    return [...this.byOrder.values()].filter((a) => a.customerId === customerId).reduce((sum, a) => sum + a.points, 0);
  }
}
