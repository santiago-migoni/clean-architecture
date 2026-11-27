// Non-production gateway, used by tests and local runs.
import type { Customer } from '../../../domain/customer';
import type { CustomerRepository } from '../../../application/ports/output/customer-repository';

export class CustomerInMemoryRepository implements CustomerRepository {
  private readonly byId: Map<string, Customer>;

  constructor(...seed: Customer[]) {
    this.byId = new Map(seed.map((c) => [c.id, c]));
  }

  async findById(id: string): Promise<Customer | null> {
    return this.byId.get(id) ?? null;
  }
}
