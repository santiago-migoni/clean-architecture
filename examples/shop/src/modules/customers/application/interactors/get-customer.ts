// src/modules/customers/application/interactors/get-customer.ts
// Layer: application. May import: this module's domain/ and application/ports/, src/shared/.
import { IGetCustomerUseCase, GetCustomerRequest, GetCustomerResponse } from '../ports/input/get-customer';
import { ICustomerRepository } from '../ports/output/customer-repository';

export class GetCustomerInteractor implements IGetCustomerUseCase {
  constructor(private readonly repository: ICustomerRepository) {}

  async execute(request: GetCustomerRequest): Promise<GetCustomerResponse | null> {
    const customer = await this.repository.findById(request.customerId);
    return customer ? { id: customer.id, name: customer.name, email: customer.email } : null;
  }
}
