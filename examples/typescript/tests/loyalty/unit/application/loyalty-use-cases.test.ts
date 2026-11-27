import { describe, it, expect, beforeEach } from 'vitest';
import { AwardPointsInteractor } from '@/modules/loyalty/application/interactors/award-points';
import { GetPointsInteractor } from '@/modules/loyalty/application/interactors/get-points';
import { AwardInMemoryRepository } from '@/modules/loyalty/infrastructure/gateways/in-memory/award-in-memory-repository';

describe('loyalty use cases (in-memory repository, no DB)', () => {
  let awards: AwardInMemoryRepository;
  beforeEach(() => { awards = new AwardInMemoryRepository(); });

  it('awards the points of an order and adds them up per customer', async () => {
    const award = new AwardPointsInteractor(awards);
    expect(await award.execute({ orderId: 'o-1', customerId: 'c-1', totalCents: 1750 })).toEqual({ awarded: true, points: 17 });
    await award.execute({ orderId: 'o-2', customerId: 'c-1', totalCents: 500 });
    await award.execute({ orderId: 'o-3', customerId: 'c-2', totalCents: 9900 });
    expect(await new GetPointsInteractor(awards).execute({ customerId: 'c-1' })).toEqual({ customerId: 'c-1', points: 22 });
  });

  it('counts an order once, however many times its event arrives', async () => {
    const award = new AwardPointsInteractor(awards);
    await award.execute({ orderId: 'o-1', customerId: 'c-1', totalCents: 1000 });
    expect(await award.execute({ orderId: 'o-1', customerId: 'c-1', totalCents: 1000 })).toEqual({ awarded: false, points: 10 });
    expect(await awards.pointsOf('c-1')).toBe(10);
  });

  it('answers 0 points for a customer it never heard of', async () => {
    expect(await new GetPointsInteractor(awards).execute({ customerId: 'ghost' })).toEqual({ customerId: 'ghost', points: 0 });
  });
});
