# Use case — TypeScript / JavaScript

Files, inside `src/modules/<module>/application/`: `interactors/<use-case>.ts`, `ports/output/<port>.ts`, `ports/input/<use-case>.ts` (optional), `errors/<name>-error.ts`. kebab-case. Interfaces are prefixed `I` (`IOrderRepository`). The examples are the real files of `examples/typescript`.

## Interactor — default flow (returns a response model)

```typescript
// src/modules/customers/application/interactors/register-customer.ts
// Layer: application. No Input Port: only a controller in this module calls it.
import { Customer } from '../../domain/customer';
import { ICustomerRepository } from '../ports/output/customer-repository';

export interface RegisterCustomerRequest { name: string; email: string }
export interface RegisterCustomerResponse { customerId: string }

export class RegisterCustomerInteractor {
  constructor(
    private readonly repository: ICustomerRepository,
    private readonly newId: () => string, // injected: randomness does not belong in business rules
  ) {}

  async execute(request: RegisterCustomerRequest): Promise<RegisterCustomerResponse> {
    const customer = Customer.create({ id: this.newId(), name: request.name, email: request.email });
    await this.repository.save(customer);
    return { customerId: customer.id };
  }
}
```

## Repository port (output)

Declared by the use case, implemented by a gateway. Only the methods this module's use cases call.

```typescript
// src/modules/orders/application/ports/output/order-repository.ts
import { Order, OrderId } from '../../../domain/order';

export interface IOrderRepository {
  findById(id: OrderId): Promise<Order | null>;
  save(order: Order): Promise<void>;
}
```

## Application error

```typescript
// src/modules/orders/application/errors/customer-not-found-error.ts
export class CustomerNotFoundError extends Error {
  constructor(public readonly customerId: string) {
    super(`Customer ${customerId} not found`);
    this.name = 'CustomerNotFoundError';
  }
}
```

## Input Port (optional) — the module's public surface

Plain data only. Move the request/response here and make the interactor implement it.

```typescript
// src/modules/customers/application/ports/input/get-customer.ts
export interface GetCustomerRequest { customerId: string }
export interface GetCustomerResponse { id: string; name: string; email: string }

export interface IGetCustomerUseCase {
  /** Resolves to null when the customer does not exist. */
  execute(request: GetCustomerRequest): Promise<GetCustomerResponse | null>;
}
```

```typescript
// src/modules/customers/application/interactors/get-customer.ts
import { GetCustomerRequest, GetCustomerResponse, IGetCustomerUseCase } from '../ports/input/get-customer';
import { ICustomerRepository } from '../ports/output/customer-repository';

export class GetCustomerInteractor implements IGetCustomerUseCase {
  constructor(private readonly repository: ICustomerRepository) {}

  async execute(request: GetCustomerRequest): Promise<GetCustomerResponse | null> {
    const customer = await this.repository.findById(request.customerId);
    return customer ? { id: customer.id, name: customer.name, email: customer.email } : null;
  }
}
```

## Cross-module port

Owned by this module, in its own vocabulary; implemented by a gateway that calls the other module's input port.

```typescript
// src/modules/orders/application/ports/output/customer-lookup.ts
export interface ICustomerLookup {
  exists(customerId: string): Promise<boolean>;
}
```

## Output Port (optional) and the interactor that uses it

The response model lives in the Output Port file, so the port and the interactor never import each other. `execute` returns nothing; only the failures the use case declares are presented, anything else is rethrown.

```typescript
// src/modules/orders/application/ports/output/place-order-output.ts
export interface PlaceOrderResponse { orderId: string; status: string; totalCents: number }

export interface IPlaceOrderOutputPort {
  present(response: PlaceOrderResponse): void;
  presentError(error: Error): void;
}
```

```typescript
// src/modules/orders/application/interactors/place-order.ts
import { Order } from '../../domain/order';
import { InvalidOrderError } from '../../domain/errors/invalid-order-error';
import { CustomerNotFoundError } from '../errors/customer-not-found-error';
import { ICustomerLookup } from '../ports/output/customer-lookup';
import { IOrderRepository } from '../ports/output/order-repository';
import { IPlaceOrderOutputPort } from '../ports/output/place-order-output';

export interface PlaceOrderRequest {
  customerId: string;
  lines: { productId: string; quantity: number; unitPriceCents: number }[];
}

export class PlaceOrderInteractor {
  constructor(
    private readonly outputPort: IPlaceOrderOutputPort,
    private readonly repository: IOrderRepository,
    private readonly customerLookup: ICustomerLookup,
    private readonly newId: () => string,
  ) {}

  async execute(request: PlaceOrderRequest): Promise<void> {
    try {
      // Enterprise rules first: a malformed order is rejected before calling another module.
      const order = Order.create({ id: this.newId(), customerId: request.customerId, lines: request.lines });
      if (!(await this.customerLookup.exists(order.customerId))) throw new CustomerNotFoundError(order.customerId);
      await this.repository.save(order);
      this.outputPort.present({ orderId: order.id, status: order.status, totalCents: order.totalCents });
    } catch (error) {
      if (error instanceof CustomerNotFoundError || error instanceof InvalidOrderError) {
        this.outputPort.presentError(error);
        return;
      }
      throw error; // a DB failure or a bug: the last-resort handler answers 500
    }
  }
}
```

## Test — no database, the other module faked through this module's port

```typescript
// tests/orders/unit/application/place-order.test.ts
import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { PlaceOrderInteractor } from '@/modules/orders/application/interactors/place-order';
import type { IPlaceOrderOutputPort } from '@/modules/orders/application/ports/output/place-order-output';
import type { ICustomerLookup } from '@/modules/orders/application/ports/output/customer-lookup';
import { CustomerNotFoundError } from '@/modules/orders/application/errors/customer-not-found-error';
import { OrderInMemoryRepository } from '@/modules/orders/infrastructure/gateways/in-memory/order-in-memory-repository';

const lines = [{ productId: 'p1', quantity: 2, unitPriceCents: 1000 }];

describe('PlaceOrderInteractor', () => {
  let repository: OrderInMemoryRepository;
  let outputPort: Mocked<IPlaceOrderOutputPort>;
  let customerLookup: Mocked<ICustomerLookup>;
  let interactor: PlaceOrderInteractor;

  beforeEach(() => {
    repository = new OrderInMemoryRepository();
    outputPort = { present: vi.fn(), presentError: vi.fn() };
    customerLookup = { exists: vi.fn().mockResolvedValue(true) };
    interactor = new PlaceOrderInteractor(outputPort, repository, customerLookup, () => 'o-1');
  });

  it('presents the response model for an existing customer', async () => {
    await interactor.execute({ customerId: 'c-1', lines });
    expect(outputPort.present).toHaveBeenCalledWith({ orderId: 'o-1', status: 'PENDING', totalCents: 2000 });
  });

  it('presents CustomerNotFoundError and persists nothing', async () => {
    customerLookup.exists.mockResolvedValue(false);
    await interactor.execute({ customerId: 'ghost', lines });
    expect(outputPort.presentError).toHaveBeenCalledWith(expect.any(CustomerNotFoundError));
    expect(await repository.findAll()).toHaveLength(0);
  });
});
```
