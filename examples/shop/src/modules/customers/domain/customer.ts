// src/modules/customers/domain/customer.ts
// Layer: domain (Enterprise Business Rules)
// Dependencies: at most src/shared/ — never app/, infra/, platform/, main/ or another module.

import { InvalidCustomerError } from './errors/invalid-customer-error';

export type CustomerId = string;

export interface CustomerProps {
  id: CustomerId;
  name: string;
  email: string;
}

export class Customer {
  private constructor(private readonly props: CustomerProps) {
    this.validate();
  }

  // Enforces invariants at creation time
  static create(props: CustomerProps): Customer {
    return new Customer({ ...props, name: props.name.trim(), email: props.email.trim().toLowerCase() });
  }

  // Rebuild from persistence
  static reconstitute(props: CustomerProps): Customer {
    return new Customer(props);
  }

  get id(): CustomerId { return this.props.id; }
  get name(): string { return this.props.name; }
  get email(): string { return this.props.email; }

  equals(other: Customer): boolean {
    return this.id === other.id;
  }

  private validate(): void {
    if (this.props.name.length === 0) throw new InvalidCustomerError('Customer name must not be empty');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(this.props.email)) throw new InvalidCustomerError('Customer email is not valid');
  }
}
