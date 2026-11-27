import { describe, it, expect } from 'vitest';
import { AuditLogOrderEvents } from '@/modules/orders/infrastructure/gateways/audit-log-order-events';

describe('AuditLogOrderEvents', () => {
  it('writes one JSON line per event to the injected sink', async () => {
    const lines: string[] = [];
    await new AuditLogOrderEvents((line) => lines.push(line))
      .publish({ type: 'OrderPlaced', orderId: 'o-1', customerId: 'c-1', totalCents: 2500 });
    expect(lines.map((l) => JSON.parse(l))).toEqual([{ type: 'OrderPlaced', orderId: 'o-1', customerId: 'c-1', totalCents: 2500 }]);
  });
});
