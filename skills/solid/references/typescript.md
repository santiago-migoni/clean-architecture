# SOLID fixes — TypeScript / JavaScript

Before/after for the three principles whose fixes are structural. SRP and LSP are judgments (the actor test, the substitution test), shown in the skill itself.

## OCP — a strategy per variant instead of a type switch

```typescript
// Violation: every new payment method edits this function.
type Payment = { type: 'CREDIT' | 'PAYPAL'; amountCents: number };

function processPayment(payment: Payment): string {
  if (payment.type === 'CREDIT') return `card:${payment.amountCents}`;
  if (payment.type === 'PAYPAL') return `paypal:${payment.amountCents}`;
  throw new Error(`unknown payment type ${payment.type}`);
}
```

```typescript
// Fix: open for extension. Strategies are registered in main/ and selected by key.
export interface PaymentStrategy {
  process(amountCents: number): Promise<string>;
}

export class ProcessPaymentInteractor {
  constructor(private readonly strategies: ReadonlyMap<string, PaymentStrategy>) {}

  async execute(method: string, amountCents: number): Promise<string> {
    const strategy = this.strategies.get(method);
    if (!strategy) throw new UnsupportedPaymentMethodError(method);
    return strategy.process(amountCents);
  }
}

export class UnsupportedPaymentMethodError extends Error {}
```

## ISP — role interfaces instead of one fat repository

```typescript
// Violation: every use case depends on reporting and deletion it never calls.
interface CustomerRepository {
  findById(id: string): Promise<Customer | null>;
  findByEmail(email: string): Promise<Customer | null>;
  save(customer: Customer): Promise<void>;
  delete(id: string): Promise<void>;
  monthlySignupReport(): Promise<string>;
}

// Fix: each use case declares only what it uses; one gateway may implement several.
interface CustomerReader { findById(id: string): Promise<Customer | null> }
interface CustomerWriter { save(customer: Customer): Promise<void> }
interface SignupReport { monthlySignupReport(): Promise<string> }

interface Customer { id: string; email: string }
```

## DIP — inject the abstraction, construct the detail in main/

```typescript
// Violation: the use case constructs its database gateway.
class PlaceOrderInteractorBefore {
  async execute(order: Order): Promise<void> {
    const repository = new PostgresOrderRepository(); // application → infrastructure
    await repository.save(order);
  }
}

// Fix: the use case depends on its own port; main/ passes the implementation in.
interface IOrderRepository { save(order: Order): Promise<void> }

class PlaceOrderInteractor {
  constructor(private readonly repository: IOrderRepository) {}

  async execute(order: Order): Promise<void> {
    await this.repository.save(order);
  }
}

interface Order { id: string }
declare class PostgresOrderRepository { save(order: Order): Promise<void> }
```
