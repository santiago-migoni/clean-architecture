import { describe, it, expect } from 'vitest';
import { PointsAward } from '@/modules/loyalty/domain/points-award';
import { InvalidPointsAwardError } from '@/modules/loyalty/domain/errors/invalid-points-award-error';
import { DomainError } from '@/shared/domain-error';

describe('PointsAward', () => {
  it.each([[0, 0], [99, 0], [100, 1], [1750, 17], [123456, 1234]])('%i cents earn %i points (one per whole dollar)', (cents, points) => {
    expect(PointsAward.forOrder('o-1', 'c-1', cents).points).toBe(points);
  });

  it.each([
    ['', 'c-1', 100, 'ORDER_REQUIRED'],
    ['o-1', ' ', 100, 'CUSTOMER_REQUIRED'],
    ['o-1', 'c-1', -1, 'INVALID_TOTAL'],
    ['o-1', 'c-1', 1.5, 'INVALID_TOTAL'],
  ])('rejects an invalid award with a stable reason (%#)', (orderId, customerId, cents, reason) => {
    expect(() => PointsAward.forOrder(orderId, customerId, cents)).toThrow(expect.objectContaining({ reason }));
  });

  it('raises a domain error from the shared kernel', () => {
    expect(new InvalidPointsAwardError('INVALID_TOTAL', 'x')).toBeInstanceOf(DomainError);
  });
});
