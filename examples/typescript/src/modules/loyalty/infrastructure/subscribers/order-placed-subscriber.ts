// src/modules/loyalty/infrastructure/subscribers/order-placed-subscriber.ts
// Layer: infrastructure — a driving adapter, like a controller: it turns orders' integration event into loyalty's
// own request. Importing orders' PUBLISHED CONTRACT is the second legal crossing between modules (the first is a
// call to another module's ports/input); orders never knows that loyalty exists.
import type { OrderPlacedV1 } from '../../../orders/application/ports/published/order-placed-v1';
import type { AwardPointsInteractor } from '../../application/interactors/award-points';

export class OrderPlacedSubscriber {
  constructor(private readonly awardPoints: AwardPointsInteractor) {}

  async handle(event: OrderPlacedV1): Promise<void> {
    await this.awardPoints.execute({ orderId: event.orderId, customerId: event.customerId, totalCents: event.totalCents });
  }
}
