import type { CustomerView, GetCustomer } from '../ports/input';
import type { CustomerRepository } from '../ports/output/customer-repository';

export class GetCustomerInteractor implements GetCustomer {
  constructor(private readonly customers: CustomerRepository) {}

  async execute(customerId: string): Promise<CustomerView | null> {
    const customer = await this.customers.findById(customerId);
    return customer ? { id: customer.id, name: customer.name } : null;
  }
}
