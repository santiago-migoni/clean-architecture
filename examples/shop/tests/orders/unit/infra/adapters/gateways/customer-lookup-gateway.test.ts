import { describe, it, expect, vi } from 'vitest';
import { CustomerLookupGateway } from '@/modules/orders/infra/adapters/gateways/customer-lookup-gateway';
import type { IGetCustomerUseCase } from '@/modules/customers/app/ports/input/get-customer';

// Only the customers module's INPUT port is faked — never its domain or infra.
describe('CustomerLookupGateway', () => {
  it('translates the customers answer into orders vocabulary (a boolean)', async () => {
    const getCustomer: IGetCustomerUseCase = { execute: vi.fn()
      .mockResolvedValueOnce({ id: 'c-1', name: 'Ada', email: 'a@b.co' })
      .mockResolvedValueOnce(null) };
    const gateway = new CustomerLookupGateway(getCustomer);
    expect(await gateway.exists('c-1')).toBe(true);
    expect(await gateway.exists('ghost')).toBe(false);
    expect(getCustomer.execute).toHaveBeenCalledWith({ customerId: 'c-1' });
  });
});
