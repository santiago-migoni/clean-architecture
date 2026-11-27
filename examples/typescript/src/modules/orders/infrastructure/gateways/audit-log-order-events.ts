// Layer: infrastructure. Implements IOrderEvents by writing one JSON line per event to an audit log.
// The sink (console, file, logger) is injected by main/: this adapter never imports platform/.
import type { IOrderEvents } from '../../application/ports/output/order-events';
import type { OrderPlaced } from '../../domain/events/order-placed';

export class AuditLogOrderEvents implements IOrderEvents {
  constructor(private readonly writeLine: (line: string) => void) {}

  async publish(event: OrderPlaced): Promise<void> {
    this.writeLine(JSON.stringify(event));
  }
}
