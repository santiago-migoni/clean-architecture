import { describe, it, expect, beforeEach } from 'vitest';
import { createDbConnection } from '@/platform/db/connection';
import { runMigrations } from '@/platform/db/migrate';
import { ordersMigrations } from '@/main/compose/orders';
import { SqlOrderRepository } from '@/modules/orders/infrastructure/gateways/sql-order-repository';
import { Order } from '@/modules/orders/domain/order';

describe('SqlOrderRepository (real SQL, in-memory SQLite)', () => {
  let repository: SqlOrderRepository;

  beforeEach(() => {
    const db = createDbConnection();
    runMigrations(db, ordersMigrations);
    repository = new SqlOrderRepository(db);
  });

  it('round-trips an aggregate with its lines, in order', async () => {
    const order = Order.create({ id: 'o-1', customerId: 'c-1', lines: [
      { productId: 'p1', quantity: 2, unitPriceCents: 1000 },
      { productId: 'p2', quantity: 1, unitPriceCents: 500 },
    ] });
    await repository.save(order);
    const found = await repository.findById('o-1');
    expect(found?.equals(order)).toBe(true);
    expect(found?.lines).toEqual(order.lines);
    expect(found?.totalCents).toBe(2500);
  });

  it('save is an upsert: re-saving replaces the lines', async () => {
    await repository.save(Order.create({ id: 'o-1', customerId: 'c-1', lines: [{ productId: 'p1', quantity: 1, unitPriceCents: 100 }] }));
    await repository.save(Order.reconstitute({ id: 'o-1', customerId: 'c-1', status: 'CANCELLED', lines: [{ productId: 'p9', quantity: 3, unitPriceCents: 10 }] }));
    const found = await repository.findById('o-1');
    expect(found?.status).toBe('CANCELLED');
    expect(found?.lines).toEqual([{ productId: 'p9', quantity: 3, unitPriceCents: 10 }]);
  });

  it('returns null for a missing id', async () => {
    expect(await repository.findById('missing')).toBeNull();
  });
});
