# Gateway — TypeScript / JavaScript

Files: `src/modules/<module>/infrastructure/gateways/`: `sql-<entity>-repository.ts` (named after the technology), `<entity>-persistence-model.ts` beside it, `in-memory/<entity>-in-memory-repository.ts`, `migrations/NNN-<change>.sql`, and cross-module gateways such as `customer-lookup-gateway.ts`. The examples are the real files of `examples/typescript` (`node:sqlite`); with an ORM or another driver the shape is the same. SQL itself: see the [SQL reference](sql.md).

## Persistence model and mapper

```typescript
// src/modules/customers/infrastructure/gateways/customer-persistence-model.ts
// The row shape, separate from the entity: the schema and the domain evolve independently.
import { Customer } from '../../domain/customer';

export interface CustomerRow { id: string; name: string; email: string }

// reconstitute, not create: stored data is re-validated, creation-time effects do not run again.
export const toDomain = (row: CustomerRow): Customer =>
  Customer.reconstitute({ id: row.id, name: row.name, email: row.email });

export const toPersistence = (c: Customer): CustomerRow => ({ id: c.id, name: c.name, email: c.email });
```

## SQL gateway

The connection is created in `platform/db/` and injected by `main/`: the gateway never imports `platform/`.

```typescript
// src/modules/customers/infrastructure/gateways/sql-customer-repository.ts
import type { DatabaseSync } from 'node:sqlite';
import { ICustomerRepository } from '../../application/ports/output/customer-repository';
import { EmailAlreadyRegisteredError } from '../../application/errors/email-already-registered-error';
import { Customer, CustomerId } from '../../domain/customer';
import { CustomerRow, toDomain, toPersistence } from './customer-persistence-model';

export class SqlCustomerRepository implements ICustomerRepository {
  constructor(private readonly db: DatabaseSync) {}

  async findById(id: CustomerId): Promise<Customer | null> {
    const row = this.db.prepare('SELECT id, name, email FROM customers WHERE id = ?').get(id) as unknown as CustomerRow | undefined;
    return row ? toDomain(row) : null;
  }

  async save(customer: Customer): Promise<void> {
    const r = toPersistence(customer);
    try {
      // Upsert by id. NEVER `INSERT OR REPLACE`: it would delete another customer with the same email.
      this.db
        .prepare('INSERT INTO customers (id, name, email) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, email = excluded.email')
        .run(r.id, r.name, r.email);
    } catch (error) {
      // Translate the driver's error into the one the port declares (anti-corruption).
      if (error instanceof Error && /UNIQUE constraint failed: customers\.email/.test(error.message)) {
        throw new EmailAlreadyRegisteredError(r.email);
      }
      throw error;
    }
  }
}
```

## In-memory gateway (created when the first test needs it)

It honours the same contract as the SQL one, including the conflict.

```typescript
// src/modules/customers/infrastructure/gateways/in-memory/customer-in-memory-repository.ts
import { EmailAlreadyRegisteredError } from '../../../application/errors/email-already-registered-error';
import { ICustomerRepository } from '../../../application/ports/output/customer-repository';
import { Customer, CustomerId } from '../../../domain/customer';

export class CustomerInMemoryRepository implements ICustomerRepository {
  private readonly store = new Map<CustomerId, Customer>();

  async findById(id: CustomerId): Promise<Customer | null> {
    return this.store.get(id) ?? null;
  }

  async save(customer: Customer): Promise<void> {
    for (const other of this.store.values()) {
      if (other.id !== customer.id && other.email === customer.email) throw new EmailAlreadyRegisteredError(customer.email);
    }
    this.store.set(customer.id, customer);
  }
}
```

## Gateway that reaches another module

The only cross-module import allowed: this module's infrastructure → the other module's input port.

```typescript
// src/modules/orders/infrastructure/gateways/customer-lookup-gateway.ts
import { ICustomerLookup } from '../../application/ports/output/customer-lookup';
import { IGetCustomerUseCase } from '../../../customers/application/ports/input/get-customer';

export class CustomerLookupGateway implements ICustomerLookup {
  constructor(private readonly getCustomer: IGetCustomerUseCase) {} // injected by main/

  async exists(customerId: string): Promise<boolean> {
    // Translate between the two modules' models here: orders only needs a boolean.
    return (await this.getCustomer.execute({ customerId })) !== null;
  }
}
```

## Integration test — real SQL, in-memory SQLite

```typescript
// tests/customers/integration/sql-customer-repository.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { createDbConnection } from '@/platform/db/connection';
import { runMigrations } from '@/platform/db/migrate';
import { customersMigrations } from '@/main/compose/customers';
import { SqlCustomerRepository } from '@/modules/customers/infrastructure/gateways/sql-customer-repository';
import { Customer } from '@/modules/customers/domain/customer';
import { EmailAlreadyRegisteredError } from '@/modules/customers/application/errors/email-already-registered-error';

describe('SqlCustomerRepository', () => {
  let repository: SqlCustomerRepository;
  beforeEach(() => {
    const db = createDbConnection();
    runMigrations(db, customersMigrations);
    repository = new SqlCustomerRepository(db);
  });

  it('round-trips a customer', async () => {
    await repository.save(Customer.create({ id: 'c-1', name: 'Ada', email: 'ada@example.com' }));
    expect((await repository.findById('c-1'))?.name).toBe('Ada');
  });

  it('a different customer with the same email is a conflict, and the first one survives', async () => {
    await repository.save(Customer.create({ id: 'c-1', name: 'Ada', email: 'ada@example.com' }));
    await expect(repository.save(Customer.create({ id: 'c-2', name: 'Other', email: 'ada@example.com' })))
      .rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
    expect((await repository.findById('c-1'))?.name).toBe('Ada');
  });

  it('returns null for a missing id', async () => {
    expect(await repository.findById('missing')).toBeNull();
  });
});
```
