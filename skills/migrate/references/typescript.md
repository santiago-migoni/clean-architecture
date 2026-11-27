# Migration steps — TypeScript / JavaScript

Each phase keeps the application working: the old code first **delegates** to the new piece, and is deleted only when nothing calls it any more (strangler fig). The old files below live in `src/services/` and `src/models/`; the new ones in `src/modules/orders/`.

## Phase 1 — extract the business rule into an entity

```typescript
// BEFORE — src/services/order-service.ts: the rule lives in a service, on a DTO
interface OrderDto { id: string; status: string; items: { sku: string }[] }

export class OrderServiceBefore {
  canCancel(order: OrderDto): boolean {
    return order.status === 'PENDING' && order.items.length > 0;
  }
}
```

```typescript
// AFTER — the rule moves to the entity; the service keeps its signature and delegates
import { Order } from '../modules/orders/domain/order';

interface OrderDto { id: string; customerId: string; status: 'PENDING' | 'CANCELLED'; items: { sku: string; qty: number; priceCents: number }[] }

export class OrderService {
  canCancel(dto: OrderDto): boolean {
    const order = Order.reconstitute({
      id: dto.id,
      customerId: dto.customerId,
      status: dto.status,
      lines: dto.items.map((i) => ({ productId: i.sku, quantity: i.qty, unitPriceCents: i.priceCents })),
    });
    return order.canBeCancelled();
  }
}
```

## Phase 2 — declare the ports, have the old classes implement them

```typescript
// src/modules/orders/application/ports/output/order-repository.ts
import { Order } from '../../../domain/order';

export interface IOrderRepository {
  findById(id: string): Promise<Order | null>;
  save(order: Order): Promise<void>;
}
```

The existing data-access class gains `implements IOrderRepository` (and a mapper); its behaviour does not change yet.

## Phase 3 — move the use case into an interactor, the service delegates

```typescript
// src/services/order-service.ts — now a thin facade kept for existing callers
import { PlaceOrderInteractor, PlaceOrderRequest, PlaceOrderResponse } from '../modules/orders/application/interactors/place-order';

export class OrderServiceFacade {
  constructor(private readonly placeOrder: PlaceOrderInteractor) {}

  async place(request: PlaceOrderRequest): Promise<PlaceOrderResponse> {
    return this.placeOrder.execute(request); // the logic moved; delete the facade when callers use the interactor
  }
}
```

## Phase 4 — wrap the existing ORM access in a gateway

```typescript
// src/modules/orders/infrastructure/gateways/typeorm-order-repository.ts
import type { Repository } from 'typeorm';
import { Order } from '../../domain/order';
import { IOrderRepository } from '../../application/ports/output/order-repository';
import { OrderRecord, toDomain, toRecord } from './order-record';

export class TypeOrmOrderRepository implements IOrderRepository {
  constructor(private readonly records: Repository<OrderRecord>) {} // the ORM entity stays in infrastructure

  async findById(id: string): Promise<Order | null> {
    const record = await this.records.findOne({ where: { id }, relations: { lines: true } });
    return record ? toDomain(record) : null;
  }

  async save(order: Order): Promise<void> {
    await this.records.save(toRecord(order));
  }
}
```

ORM decorators (`@Entity`, `@Column`) move from the old model to `OrderRecord` in `infrastructure/`: the domain entity never carries them.

## Phase 7 — enforcement

Use the `eslint.config.js` of the `init` skill's TypeScript reference. During the migration set `boundaries/dependencies` to `1` (warn), so existing violations are visible without breaking the build, and raise it to `2` (error) once a module is migrated. `ca_scan` checks the same rules plus SQL table ownership.
