# Event — TypeScript / JavaScript

The complete, tested version of this code is [`examples/typescript`](../../../examples/typescript): the same application in every language.

Files: the contract in `src/modules/<a>/application/ports/published/<event>-v<n>.ts`, the publishing adapter in `src/modules/<a>/infrastructure/gateways/`, the subscriber in `src/modules/<b>/infrastructure/subscribers/<event>-subscriber.ts`, the bus in `src/platform/events/`. Here `orders` publishes `OrderPlaced` and `loyalty` awards points for it.

## The published contract (orders)

```typescript
// src/modules/orders/application/ports/published/order-placed-v1.ts
// A PUBLISHED CONTRACT (integration event): what `orders` announces to other modules. Part of the module's public
// surface, like application/ports/input. Plain, versioned data: it imports nothing, so a subscriber depends on this
// file only, never on orders' domain. A change that breaks a subscriber is a new version (v2), published beside v1.
export const ORDER_PLACED_V1 = 'orders.order-placed.v1';

export interface OrderPlacedV1 {
  readonly type: typeof ORDER_PLACED_V1;
  readonly orderId: string;
  readonly customerId: string;
  readonly totalCents: number;
}
```

## The publishing adapter (orders)

The use case publishes the domain event through its own port (`IOrderEvents`); this adapter maps it to the contract.

```typescript
// Layer: infrastructure. Implements IOrderEvents by publishing each domain event as orders' integration event.
// It maps the domain event (orders' own vocabulary) to the published contract (what other modules may rely on).
// The bus is injected by main/ as a function: this adapter never imports platform/.
import type { IOrderEvents } from '../../application/ports/output/order-events';
import { ORDER_PLACED_V1, type OrderPlacedV1 } from '../../application/ports/published/order-placed-v1';
import type { OrderPlaced } from '../../domain/events/order-placed';

export class PublishedOrderEvents implements IOrderEvents {
  constructor(private readonly send: (event: OrderPlacedV1) => Promise<void>) {}

  async publish(event: OrderPlaced): Promise<void> {
    await this.send({ type: ORDER_PLACED_V1, orderId: event.orderId, customerId: event.customerId, totalCents: event.totalCents });
  }
}
```

## The subscriber (loyalty)

```typescript
// src/modules/loyalty/infrastructure/subscribers/order-placed-subscriber.ts
// Layer: infrastructure — a driving adapter, like a controller: it turns orders' integration event into loyalty's
// own request. Importing orders' PUBLISHED CONTRACT is the second legal crossing between modules (the first is a
// call to another module's ports/input); orders never knows that loyalty exists.
import type { OrderPlacedV1 } from '../../../orders/application/ports/published/order-placed-v1';
import type { AwardPointsInteractor } from '../../application/interactors/award-points';

export class OrderPlacedSubscriber {
  constructor(private readonly awardPoints: AwardPointsInteractor) {}

  async handle(event: OrderPlacedV1): Promise<void> {
    await this.awardPoints.execute({ orderId: event.orderId, customerId: event.customerId, totalCents: event.totalCents });
  }
}
```

Loyalty's own use case, idempotent by order: the repository's `add` returns `false` for an order already awarded (a primary key on `order_id` in SQL, `ON CONFLICT DO NOTHING`).

```typescript
// Layer: application. Awards the points of one placed order. It knows nothing of how it is called (an event, a
// command line, a backfill script): the subscriber in infrastructure translates orders' event into this request.
import { PointsAward } from '../../domain/points-award';
import type { IAwardRepository } from '../ports/output/award-repository';

export interface AwardPointsRequest {
  orderId: string;
  customerId: string;
  totalCents: number;
}

export interface AwardPointsResponse {
  awarded: boolean; // false when this order had already been awarded
  points: number;   // the points of this order
}

export class AwardPointsInteractor {
  constructor(private readonly awards: IAwardRepository) {}

  async execute(request: AwardPointsRequest): Promise<AwardPointsResponse> {
    const award = PointsAward.forOrder(request.orderId, request.customerId, request.totalCents);
    const awarded = await this.awards.add(award); // idempotent: one award per order
    return { awarded, points: award.points };
  }
}
```

## The bus (platform/events)

```typescript
// src/platform/events/in-process-bus.ts — delivers integration events to the subscribers main/ registered, in the
// same process. A driver, like the database: replacing it with a broker (and an outbox) changes no module.
//
// Delivery is synchronous and in order, after the publisher stored its change. A subscriber that fails is logged
// and never fails the publisher: the order is placed whatever loyalty does. There is no retry: an event whose
// subscriber failed is lost for that subscriber (at most once). An outbox, written in the same transaction as the
// change and published afterwards, is what makes it at least once.

export interface IntegrationEvent {
  readonly type: string;
}

type Handler<E extends IntegrationEvent> = (event: E) => Promise<void> | void;

export class InProcessBus {
  private readonly byType = new Map<string, Handler<IntegrationEvent>[]>();
  private readonly all: Handler<IntegrationEvent>[] = [];

  constructor(private readonly onError: (error: unknown, event: IntegrationEvent) => void) {}

  subscribe<E extends IntegrationEvent>(type: E['type'], handler: Handler<E>): void {
    this.byType.set(type, [...(this.byType.get(type) ?? []), handler as Handler<IntegrationEvent>]);
  }

  /** Every event, whatever its type: an audit log, a tracer. */
  subscribeAll(handler: Handler<IntegrationEvent>): void {
    this.all.push(handler);
  }

  readonly publish = async (event: IntegrationEvent): Promise<void> => {
    for (const handler of [...(this.byType.get(event.type) ?? []), ...this.all]) {
      try {
        await handler(event);
      } catch (error) {
        this.onError(error, event);
      }
    }
  };
}
```

## The wiring (main)

```typescript
// src/main/index.ts (excerpt) — the only place that knows the bus, the publisher and the subscribers
import { InProcessBus } from '../platform/events/in-process-bus';
import { ORDER_PLACED_V1, type OrderPlacedV1 } from '../modules/orders/application/ports/published/order-placed-v1';
import { composeOrders } from './compose/orders';
import { composeLoyalty, sqlAwards } from './compose/loyalty';
import type { DatabaseSync } from 'node:sqlite';
import type { IGetCustomerUseCase } from '../modules/customers/application/ports/input/get-customer';

export function wire(db: DatabaseSync, newId: () => string, getCustomer: IGetCustomerUseCase, auditLog: (line: string) => void) {
  const bus = new InProcessBus((error, event) => console.error(`Subscriber failed on ${event.type}:`, error));
  const orders = composeOrders({ db, newId, getCustomer, publish: bus.publish, defaultLocale: 'en' }); // orders announces
  const loyalty = composeLoyalty(sqlAwards(db));
  bus.subscribe<OrderPlacedV1>(ORDER_PLACED_V1, (event) => loyalty.subscribers.orderPlaced.handle(event)); // loyalty reacts
  bus.subscribeAll((event) => auditLog(JSON.stringify(event))); // every integration event
  return { ...orders.routes, ...loyalty.routes };
}
```

## Tests

```typescript
// tests/orders/unit/infrastructure/gateways/published-order-events.test.ts
import { describe, it, expect } from 'vitest';
import { PublishedOrderEvents } from '@/modules/orders/infrastructure/gateways/published-order-events';
import type { OrderPlacedV1 } from '@/modules/orders/application/ports/published/order-placed-v1';

describe('PublishedOrderEvents', () => {
  it('maps the domain event to the published contract, and publishes it', async () => {
    const sent: OrderPlacedV1[] = [];
    await new PublishedOrderEvents(async (event) => { sent.push(event); })
      .publish({ type: 'OrderPlaced', orderId: 'o-1', customerId: 'c-1', totalCents: 2500 });
    expect(sent).toEqual([{ type: 'orders.order-placed.v1', orderId: 'o-1', customerId: 'c-1', totalCents: 2500 }]);
  });
});
```

```typescript
// tests/loyalty/unit/application/loyalty-use-cases.test.ts (excerpt)
import { describe, it, expect } from 'vitest';
import { AwardPointsInteractor } from '@/modules/loyalty/application/interactors/award-points';
import { AwardInMemoryRepository } from '@/modules/loyalty/infrastructure/gateways/in-memory/award-in-memory-repository';

describe('AwardPoints', () => {
  it('counts an order once, however many times its event arrives', async () => {
    const awards = new AwardInMemoryRepository();
    const award = new AwardPointsInteractor(awards);
    await award.execute({ orderId: 'o-1', customerId: 'c-1', totalCents: 1000 });
    expect(await award.execute({ orderId: 'o-1', customerId: 'c-1', totalCents: 1000 })).toEqual({ awarded: false, points: 10 });
    expect(await awards.pointsOf('c-1')).toBe(10);
  });
});
```

```typescript
// tests/platform/in-process-bus.test.ts
import { describe, it, expect, vi } from 'vitest';
import { InProcessBus, type IntegrationEvent } from '@/platform/events/in-process-bus';

describe('InProcessBus', () => {
  const placed = { type: 'orders.order-placed.v1' };
  const other = { type: 'customers.customer-registered.v1' };

  it('delivers an event to the subscribers of its type, in order, and to every catch-all subscriber', async () => {
    const bus = new InProcessBus(() => {});
    const seen: string[] = [];
    bus.subscribe(placed.type, () => { seen.push('first'); });
    bus.subscribe(placed.type, () => { seen.push('second'); });
    bus.subscribeAll((e: IntegrationEvent) => { seen.push(`all:${e.type}`); });
    await bus.publish(placed);
    await bus.publish(other);
    expect(seen).toEqual(['first', 'second', 'all:orders.order-placed.v1', 'all:customers.customer-registered.v1']);
  });

  it('a failing subscriber is reported and never stops the others nor fails the publisher', async () => {
    const onError = vi.fn();
    const bus = new InProcessBus(onError);
    const after = vi.fn();
    const boom = new Error('loyalty is down');
    bus.subscribe(placed.type, () => { throw boom; });
    bus.subscribe(placed.type, after);
    await expect(bus.publish(placed)).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(boom, placed);
    expect(after).toHaveBeenCalledWith(placed);
  });
});
```
