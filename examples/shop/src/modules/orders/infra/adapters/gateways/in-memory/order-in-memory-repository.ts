// Used by use case unit tests — no DB needed.
import { IOrderRepository } from '../../../../app/ports/output/order-repository';
import { Order, OrderId } from '../../../../domain/order';

export class OrderInMemoryRepository implements IOrderRepository {
  private readonly store = new Map<OrderId, Order>();
  async findById(id: OrderId): Promise<Order | null> { return this.store.get(id) ?? null; }
  async save(order: Order): Promise<void> { this.store.set(order.id, order); }
  async findAll(): Promise<Order[]> { return [...this.store.values()]; } // test helper
}
