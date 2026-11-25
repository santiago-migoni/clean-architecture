// src/modules/customers/app/interactors/register-customer.ts
// Layer: app. No Input Port: only a controller in this module will call it.
import { Customer } from '../../domain/customer';
import { ICustomerRepository } from '../ports/output/customer-repository';

export interface RegisterCustomerRequest { name: string; email: string }
export interface RegisterCustomerResponse { customerId: string }

export class RegisterCustomerInteractor {
  constructor(
    private readonly repository: ICustomerRepository,
    private readonly newId: () => string, // injected: randomness does not belong in business rules
  ) {}

  async execute(request: RegisterCustomerRequest): Promise<RegisterCustomerResponse> {
    const customer = Customer.create({ id: this.newId(), name: request.name, email: request.email });
    await this.repository.save(customer);
    return { customerId: customer.id };
  }
}
