// infrastructure only: DB rows + mappers. The domain never knows about this file.
import { Order, OrderStatus } from '../../domain/order';

export interface OrderRow { id: string; customer_id: string; status: string }
export interface OrderLineRow { order_id: string; position: number; product_id: string; quantity: number; unit_price_cents: number }

export function toDomain(row: OrderRow, lines: OrderLineRow[]): Order {
  return Order.reconstitute({
    id: row.id,
    customerId: row.customer_id,
    status: row.status as OrderStatus,
    lines: lines.map((l) => ({ productId: l.product_id, quantity: l.quantity, unitPriceCents: l.unit_price_cents })),
  });
}

export function toPersistence(order: Order): { order: OrderRow; lines: OrderLineRow[] } {
  return {
    order: { id: order.id, customer_id: order.customerId, status: order.status },
    lines: order.lines.map((l, i) => ({
      order_id: order.id, position: i, product_id: l.productId, quantity: l.quantity, unit_price_cents: l.unitPriceCents,
    })),
  };
}
