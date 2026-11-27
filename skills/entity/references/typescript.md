# Entity — TypeScript / JavaScript

Files: `src/modules/<module>/domain/<entity>.ts`, kebab-case (`order.ts`, `order-line.ts`). Domain errors in `domain/errors/`, created with the first one. The example is `examples/typescript/src/modules/orders/domain/order.ts`. In JavaScript, write the same code without the type annotations.

## Entity

```typescript
// src/modules/orders/domain/order.ts
// Layer: domain. May import only src/shared/. The customer is referenced by id only.
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

  // Creation: sets the initial state, then enforces the invariants.
  static create(props: Omit<OrderProps, 'status'>): Order {
    return new Order({ ...props, status: 'PENDING' });
  }

  // Rebuild from persistence: same invariants, no creation-time effects (initial status, events).
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
    if (this.props.customerId.trim() === '') throw new InvalidOrderError('Order must reference a customer');
    if (this.props.lines.length === 0) throw new InvalidOrderError('Order must have at least one line');
    for (const l of this.props.lines) {
      if (!Number.isInteger(l.quantity) || l.quantity <= 0) throw new InvalidOrderError('Line quantity must be a positive integer');
      if (!Number.isInteger(l.unitPriceCents) || l.unitPriceCents < 0) throw new InvalidOrderError('Unit price must be a non-negative integer (cents)');
    }
  }
}
```

## Domain error

Each module declares its own error; the shared kernel holds their common base, so outer layers can catch any broken
business rule with one type.

```typescript
// src/shared/domain-error.ts — shared kernel: imports nothing, holds no module's policy
export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
```

```typescript
// src/modules/orders/domain/errors/invalid-order-error.ts
// A rule of the Order aggregate was violated. Thrown by the entity, mapped by the outer layers by type.
import { DomainError } from '../../../../shared/domain-error';

export class InvalidOrderError extends DomainError {}
```

## Value object

Immutable, compared by value. In `domain/` when only this module uses it; in `src/shared/` when several modules genuinely share it.

```typescript
// src/shared/money.ts
export class Money {
  private constructor(readonly cents: number, readonly currency: string) {}

  static of(cents: number, currency: string): Money {
    if (!Number.isInteger(cents)) throw new RangeError('Money is an integer amount of cents');
    return new Money(cents, currency.toUpperCase());
  }

  add(other: Money): Money {
    if (other.currency !== this.currency) throw new RangeError(`Cannot add ${other.currency} to ${this.currency}`);
    return new Money(this.cents + other.cents, this.currency);
  }

  equals(other: Money): boolean {
    return this.cents === other.cents && this.currency === other.currency;
  }
}
```

## Test

```typescript
// tests/orders/unit/domain/order.test.ts — no mocks: the entity is pure
import { describe, expect, it } from 'vitest';
import { Order } from '../../../../src/modules/orders/domain/order';
import { InvalidOrderError } from '../../../../src/modules/orders/domain/errors/invalid-order-error';

const line = { productId: 'p-1', quantity: 2, unitPriceCents: 1250 };

describe('Order', () => {
  it('starts pending and totals its lines', () => {
    const order = Order.create({ id: 'o-1', customerId: 'c-1', lines: [line] });
    expect(order.status).toBe('PENDING');
    expect(order.totalCents).toBe(2500);
    expect(order.canBeCancelled()).toBe(true);
  });

  it('rejects an order without lines', () => {
    expect(() => Order.create({ id: 'o-1', customerId: 'c-1', lines: [] })).toThrow(InvalidOrderError);
  });
});
```
