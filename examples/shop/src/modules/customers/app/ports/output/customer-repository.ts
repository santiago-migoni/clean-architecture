// src/modules/customers/app/ports/output/customer-repository.ts
// Belongs to the APP layer, not infra: the use case defines what it needs; a gateway satisfies it.
import { Customer, CustomerId } from '../../../domain/customer';

export interface ICustomerRepository {
  findById(id: CustomerId): Promise<Customer | null>;
  /** Upsert by id. @throws EmailAlreadyRegisteredError if ANOTHER customer already uses the same email. */
  save(customer: Customer): Promise<void>;
}
