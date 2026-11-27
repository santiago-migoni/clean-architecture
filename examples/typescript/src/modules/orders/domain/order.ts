// src/modules/orders/domain/order.ts
// Layer: domain (Enterprise Business Rules)
// Dependencies: at most src/shared/ — never application/, infrastructure/, platform/, main/ or another module.
// The customer is referenced by id only: the `customers` module is never imported.

import { InvalidOrderError } from './errors/invalid-order-error';

export type OrderId = string;
export type OrderStatus = 'PENDING' | 'CANCELLED';

export interface OrderLine {
  productId: string;
  quantity: number;
  unitPriceCents: number;
}

export interface OrderProps {
  id: OrderId;
  customerId: string;
  lines: OrderLine[];
  status: OrderStatus;
}

export class Order {
  private constructor(private readonly props: OrderProps) {
    this.validate();
  }

  static create(props: Omit<OrderProps, 'status'>): Order {
    return new Order({ ...props, status: 'PENDING' });
  }

  static reconstitute(props: OrderProps): Order {
    return new Order(props);
  }

  get id(): OrderId { return this.props.id; }
  get customerId(): string { return this.props.customerId; }
  get status(): OrderStatus { return this.props.status; }
  get lines(): readonly OrderLine[] { return this.props.lines; }

  get totalCents(): number {
    return this.props.lines.reduce((sum, l) => sum + l.quantity * l.unitPriceCents, 0);
  }

  // Critical Business Rule
  canBeCancelled(): boolean {
    return this.props.status === 'PENDING';
  }

  equals(other: Order): boolean {
    return this.id === other.id;
  }

  private validate(): void {
    if (this.props.customerId.trim() === '') throw new InvalidOrderError('CUSTOMER_REQUIRED', 'Order must reference a customer');
    if (this.props.lines.length === 0) throw new InvalidOrderError('NO_LINES', 'Order must have at least one line');
    for (const l of this.props.lines) {
      if (l.productId.trim() === '') throw new InvalidOrderError('PRODUCT_REQUIRED', 'Line product id must not be empty');
      if (!Number.isInteger(l.quantity) || l.quantity <= 0) throw new InvalidOrderError('INVALID_QUANTITY', 'Line quantity must be a positive integer');
      if (!Number.isInteger(l.unitPriceCents) || l.unitPriceCents < 0) throw new InvalidOrderError('INVALID_UNIT_PRICE', 'Unit price must be a non-negative integer (cents)');
    }
  }
}
