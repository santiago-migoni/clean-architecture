import type { Order } from '@/modules/orders/domain/order';

export interface OrderRepository {
  save(order: Order): Promise<void>;
}
