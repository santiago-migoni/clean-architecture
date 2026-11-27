// Non-production implementation of IOrderEvents: keeps the events so tests can assert on them.
import type { IOrderEvents } from '../../../application/ports/output/order-events';
import type { OrderPlaced } from '../../../domain/events/order-placed';

export class RecordingOrderEvents implements IOrderEvents {
  readonly published: OrderPlaced[] = [];

  async publish(event: OrderPlaced): Promise<void> {
    this.published.push(event);
  }
}
