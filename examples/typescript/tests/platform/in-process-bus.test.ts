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
