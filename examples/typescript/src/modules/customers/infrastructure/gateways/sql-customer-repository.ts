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
      // Upsert by id. NEVER `INSERT OR REPLACE`: it resolves a conflict on ANY unique constraint by
      // deleting the other row, which would silently destroy a different customer with the same email.
      this.db
        .prepare('INSERT INTO customers (id, name, email) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, email = excluded.email')
        .run(r.id, r.name, r.email);
    } catch (error) {
      // Translate the persistence failure into the error declared by the port (anti-corruption).
      if (error instanceof Error && /UNIQUE constraint failed: customers\.email/.test(error.message)) {
        throw new EmailAlreadyRegisteredError(r.email);
      }
      throw error;
    }
  }
}
