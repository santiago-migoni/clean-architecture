import { describe, it, expect, vi } from 'vitest';
import { OrderPlacedSubscriber } from '@/modules/loyalty/infrastructure/subscribers/order-placed-subscriber';
import type { AwardPointsInteractor } from '@/modules/loyalty/application/interactors/award-points';

describe('OrderPlacedSubscriber', () => {
  it("translates orders' event into loyalty's own request", async () => {
    const useCase = { execute: vi.fn().mockResolvedValue({ awarded: true, points: 17 }) };
    await new OrderPlacedSubscriber(useCase as unknown as AwardPointsInteractor)
      .handle({ type: 'orders.order-placed.v1', orderId: 'o-1', customerId: 'c-1', totalCents: 1750 });
    expect(useCase.execute).toHaveBeenCalledWith({ orderId: 'o-1', customerId: 'c-1', totalCents: 1750 });
  });
});
