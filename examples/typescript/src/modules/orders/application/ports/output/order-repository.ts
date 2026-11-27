// src/modules/orders/application/ports/output/order-repository.ts
// Belongs to the APPLICATION layer, not infrastructure: the use case defines what it needs; a gateway satisfies it.

import { Order, OrderId } from '../../../domain/order';

export interface IOrderRepository {
  findById(id: OrderId): Promise<Order | null>;
  save(order: Order): Promise<void>;
}
