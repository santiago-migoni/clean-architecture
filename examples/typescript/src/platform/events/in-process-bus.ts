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
