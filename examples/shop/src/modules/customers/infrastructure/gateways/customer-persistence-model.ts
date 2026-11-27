import { Customer } from '../../domain/customer';

export interface CustomerRow { id: string; name: string; email: string }

export const toDomain = (row: CustomerRow): Customer =>
  Customer.reconstitute({ id: row.id, name: row.name, email: row.email });

export const toPersistence = (c: Customer): CustomerRow => ({ id: c.id, name: c.name, email: c.email });
