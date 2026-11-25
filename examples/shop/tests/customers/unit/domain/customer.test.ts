import { describe, it, expect } from 'vitest';
import { Customer } from '@/modules/customers/domain/customer';

describe('Customer entity', () => {
  it('creates a valid customer and normalises name and email', () => {
    const c = Customer.create({ id: 'c-1', name: '  Ada  ', email: 'ADA@Example.com ' });
    expect(c.name).toBe('Ada');
    expect(c.email).toBe('ada@example.com');
  });

  it('rejects an empty name', () => {
    expect(() => Customer.create({ id: 'c-1', name: '  ', email: 'a@b.co' })).toThrow('name');
  });

  it('rejects an invalid email', () => {
    expect(() => Customer.create({ id: 'c-1', name: 'Ada', email: 'not-an-email' })).toThrow('email');
  });

  it('is equal to another customer with the same id', () => {
    const a = Customer.reconstitute({ id: 'c-1', name: 'Ada', email: 'a@b.co' });
    const b = Customer.reconstitute({ id: 'c-1', name: 'Other', email: 'o@b.co' });
    expect(a.equals(b)).toBe(true);
  });
});
