import { describe, it, expect, beforeEach } from 'vitest';
import { createDbConnection } from '@/platform/db/connection';
import { runMigrations } from '@/platform/db/migrate';
import { loyaltyMigrations } from '@/main/compose/loyalty';
import { SqlAwardRepository } from '@/modules/loyalty/infrastructure/gateways/sql-award-repository';
import { PointsAward } from '@/modules/loyalty/domain/points-award';

describe('SqlAwardRepository (real SQL, in-memory SQLite)', () => {
  let awards: SqlAwardRepository;

  beforeEach(() => {
    const db = createDbConnection();
    runMigrations(db, loyaltyMigrations); // loyalty's own tables only: it needs none of another module's
    awards = new SqlAwardRepository(db);
  });

  it('adds up the points of a customer, and 0 for an unknown one', async () => {
    await awards.add(PointsAward.forOrder('o-1', 'c-1', 1750));
    await awards.add(PointsAward.forOrder('o-2', 'c-1', 500));
    await awards.add(PointsAward.forOrder('o-3', 'c-2', 9900));
    expect(await awards.pointsOf('c-1')).toBe(22);
    expect(await awards.pointsOf('ghost')).toBe(0);
  });

  it('ignores a second award for the same order: never added, never replaced', async () => {
    expect(await awards.add(PointsAward.forOrder('o-1', 'c-1', 1000))).toBe(true);
    expect(await awards.add(PointsAward.forOrder('o-1', 'c-1', 99900))).toBe(false);
    expect(await awards.pointsOf('c-1')).toBe(10);
  });
});
