// Layer: infra. Implements orders' own port by calling the customers module's INPUT port.
// This is the only kind of cross-module import allowed: infra → another module's app/ports/input.
import { ICustomerLookup } from '../../../app/ports/output/customer-lookup';
import { IGetCustomerUseCase } from '../../../../customers/app/ports/input/get-customer';

export class CustomerLookupGateway implements ICustomerLookup {
  constructor(private readonly getCustomer: IGetCustomerUseCase) {} // injected by main/

  async exists(customerId: string): Promise<boolean> {
    // Translate between the two modules' models here (anti-corruption): orders only needs a boolean.
    return (await this.getCustomer.execute({ customerId })) !== null;
  }
}
