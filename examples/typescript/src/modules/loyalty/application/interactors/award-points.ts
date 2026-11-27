// Layer: application. Awards the points of one placed order. It knows nothing of how it is called (an event, a
// command line, a backfill script): the subscriber in infrastructure translates orders' event into this request.
import { PointsAward } from '../../domain/points-award';
import type { IAwardRepository } from '../ports/output/award-repository';

export interface AwardPointsRequest {
  orderId: string;
  customerId: string;
  totalCents: number;
}

export interface AwardPointsResponse {
  awarded: boolean; // false when this order had already been awarded
  points: number;   // the points of this order
}

export class AwardPointsInteractor {
  constructor(private readonly awards: IAwardRepository) {}

  async execute(request: AwardPointsRequest): Promise<AwardPointsResponse> {
    const award = PointsAward.forOrder(request.orderId, request.customerId, request.totalCents);
    const awarded = await this.awards.add(award); // idempotent: one award per order
    return { awarded, points: award.points };
  }
}
