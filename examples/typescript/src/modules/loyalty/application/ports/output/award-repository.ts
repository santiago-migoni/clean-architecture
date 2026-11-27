// Output port: where loyalty keeps its awards. One award per order, so an event delivered twice counts once.
import type { PointsAward } from '../../../domain/points-award';

export interface IAwardRepository {
  /** Stores the award; false (and nothing changes) when the order already has one. */
  add(award: PointsAward): Promise<boolean>;
  pointsOf(customerId: string): Promise<number>;
}
