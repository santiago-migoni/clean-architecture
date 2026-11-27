// Layer: application. The points a customer has. A customer loyalty never heard of has 0: loyalty does not ask the
// customers module whether the customer exists, and it may not have received an order event yet.
import type { IAwardRepository } from '../ports/output/award-repository';

export interface GetPointsResponse {
  customerId: string;
  points: number;
}

export class GetPointsInteractor {
  constructor(private readonly awards: IAwardRepository) {}

  async execute(request: { customerId: string }): Promise<GetPointsResponse> {
    return { customerId: request.customerId, points: await this.awards.pointsOf(request.customerId) };
  }
}
