import { describe, it, expect, vi } from 'vitest';
import type { Request } from 'express';
import { PlaceOrderController } from '@/modules/orders/infrastructure/controllers/place-order-controller';

const call = async (body: unknown) => {
  const useCase = { execute: vi.fn().mockResolvedValue(undefined) };
  await new PlaceOrderController(useCase as never).handle({ body } as Request);
  return useCase.execute.mock.calls[0][0];
};

describe('PlaceOrderController', () => {
  it('translates the HTTP vocabulary (items) into the use case vocabulary (lines)', async () => {
    expect(await call({ customerId: 'c-1', items: [{ productId: 'p1', quantity: '2', unitPriceCents: 1000 }] }))
      .toEqual({ customerId: 'c-1', lines: [{ productId: 'p1', quantity: 2, unitPriceCents: 1000 }] });
  });

  it('coerces a malformed body instead of crashing; business validation stays in the entity', async () => {
    expect(await call(undefined)).toEqual({ customerId: '', lines: [] });
    expect(await call({ customerId: 'c-1', items: 'nope' })).toEqual({ customerId: 'c-1', lines: [] });
    const r = await call({ customerId: 'c-1', items: [{ productId: 'p1', quantity: 'abc' }] });
    expect(Number.isNaN(r.lines[0].quantity)).toBe(true); // rejected later as InvalidOrderError
  });
});
