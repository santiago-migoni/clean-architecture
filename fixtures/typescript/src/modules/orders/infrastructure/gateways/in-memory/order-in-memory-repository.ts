// Non-production gateway, used by tests and local runs.
import type { Order } from '../../../domain/order';
import type { OrderRepository } from '../../../application/ports/output/order-repository';

export class OrderInMemoryRepository implements OrderRepository {
  readonly orders: Order[] = [];

  async save(order: Order): Promise<void> {
    this.orders.push(order);
  }
}
