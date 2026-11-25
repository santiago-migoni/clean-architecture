// src/modules/orders/app/ports/output/order-repository.ts
// Belongs to the APP layer, not infra: the use case defines what it needs; a gateway satisfies it.

import { Order, OrderId } from '../../../domain/order';

export interface IOrderRepository {
  findById(id: OrderId): Promise<Order | null>;
  save(order: Order): Promise<void>;
}
