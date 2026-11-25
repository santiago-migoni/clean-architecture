import { EmailAlreadyRegisteredError } from '../../../../app/errors/email-already-registered-error';
import { ICustomerRepository } from '../../../../app/ports/output/customer-repository';
import { Customer, CustomerId } from '../../../../domain/customer';

export class CustomerInMemoryRepository implements ICustomerRepository {
  private readonly store = new Map<CustomerId, Customer>();
  async findById(id: CustomerId): Promise<Customer | null> { return this.store.get(id) ?? null; }
  async save(customer: Customer): Promise<void> {
    // Same contract as the SQL gateway: another customer with the same email is a conflict
    for (const other of this.store.values()) {
      if (other.id !== customer.id && other.email === customer.email) throw new EmailAlreadyRegisteredError(customer.email);
    }
    this.store.set(customer.id, customer);
  }
}
