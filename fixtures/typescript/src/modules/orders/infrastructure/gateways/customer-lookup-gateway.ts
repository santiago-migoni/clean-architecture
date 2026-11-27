// The only kind of cross-module import allowed: infrastructure -> another module's application/ports/input.
import type { GetCustomer } from '@/modules/customers/application/ports/input';
import type { CustomerLookup } from '../../application/ports/output/customer-lookup';

export class CustomerLookupGateway implements CustomerLookup {
  constructor(private readonly getCustomer: GetCustomer) {}

  async exists(customerId: string): Promise<boolean> {
    return (await this.getCustomer.execute(customerId)) !== null;
  }
}
