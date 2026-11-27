import { describe, it, expect, beforeEach } from 'vitest';
import { createDbConnection } from '@/platform/db/connection';
import { runMigrations } from '@/platform/db/migrate';
import { customersMigrations } from '@/main/compose/customers';
import { SqlCustomerRepository } from '@/modules/customers/infrastructure/gateways/sql-customer-repository';
import { Customer } from '@/modules/customers/domain/customer';
import { EmailAlreadyRegisteredError } from '@/modules/customers/application/errors/email-already-registered-error';

describe('SqlCustomerRepository (real SQL, in-memory SQLite)', () => {
  let repository: SqlCustomerRepository;
  beforeEach(() => {
    const db = createDbConnection();
    runMigrations(db, customersMigrations);
    repository = new SqlCustomerRepository(db);
  });

  it('round-trips a customer', async () => {
    await repository.save(Customer.create({ id: 'c-1', name: 'Ada', email: 'ada@example.com' }));
    const found = await repository.findById('c-1');
    expect(found?.name).toBe('Ada');
    expect(found?.email).toBe('ada@example.com');
  });

  it('save is an upsert by id: updating the same customer is not a conflict', async () => {
    await repository.save(Customer.create({ id: 'c-1', name: 'Ada', email: 'ada@example.com' }));
    await repository.save(Customer.create({ id: 'c-1', name: 'Ada L.', email: 'ada@example.com' }));
    expect((await repository.findById('c-1'))?.name).toBe('Ada L.');
  });

  it('a different customer with the same email is a conflict and the FIRST ONE SURVIVES', async () => {
    await repository.save(Customer.create({ id: 'c-1', name: 'Ada', email: 'ada@example.com' }));
    await expect(repository.save(Customer.create({ id: 'c-2', name: 'Other', email: 'ada@example.com' })))
      .rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
    expect((await repository.findById('c-1'))?.name).toBe('Ada'); // INSERT OR REPLACE would have deleted it
    expect(await repository.findById('c-2')).toBeNull();
  });

  it('returns null for a missing id', async () => {
    expect(await repository.findById('missing')).toBeNull();
  });
});
