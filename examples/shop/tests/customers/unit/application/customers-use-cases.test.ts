import { describe, it, expect, beforeEach } from 'vitest';
import { RegisterCustomerInteractor } from '@/modules/customers/application/interactors/register-customer';
import { EmailAlreadyRegisteredError } from '@/modules/customers/application/errors/email-already-registered-error';
import { GetCustomerInteractor } from '@/modules/customers/application/interactors/get-customer';
import { CustomerInMemoryRepository } from '@/modules/customers/infrastructure/gateways/in-memory/customer-in-memory-repository';

describe('customers use cases (no DB)', () => {
  let repository: CustomerInMemoryRepository;
  let register: RegisterCustomerInteractor;
  let get: GetCustomerInteractor;

  beforeEach(() => {
    repository = new CustomerInMemoryRepository();
    register = new RegisterCustomerInteractor(repository, () => 'c-1');
    get = new GetCustomerInteractor(repository);
  });

  it('registers a customer and returns its id', async () => {
    expect(await register.execute({ name: 'Ada', email: 'ada@example.com' })).toEqual({ customerId: 'c-1' });
    expect(await repository.findById('c-1')).not.toBeNull();
  });

  it('rejects an invalid customer without persisting it', async () => {
    await expect(register.execute({ name: '', email: 'ada@example.com' })).rejects.toThrow('name');
    expect(await repository.findById('c-1')).toBeNull();
  });

  it('refuses a second customer with the same email (the in-memory repository honours the same contract)', async () => {
    await register.execute({ name: 'Ada', email: 'ada@example.com' });
    const second = new RegisterCustomerInteractor(repository, () => 'c-2');
    await expect(second.execute({ name: 'Other', email: 'ADA@example.com' })).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
    expect(await repository.findById('c-2')).toBeNull();
  });

  it('GetCustomer returns plain data for an existing customer and null otherwise', async () => {
    await register.execute({ name: 'Ada', email: 'ada@example.com' });
    expect(await get.execute({ customerId: 'c-1' })).toEqual({ id: 'c-1', name: 'Ada', email: 'ada@example.com' });
    expect(await get.execute({ customerId: 'nope' })).toBeNull();
  });
});
