import { newId } from '../../../../shared/id';
import { Order } from '../../domain/order';
import type { CustomerLookup } from '../ports/output/customer-lookup';
import type { OrderRepository } from '../ports/output/order-repository';

export class CustomerNotFoundError extends Error {}

export class PlaceOrderInteractor {
  constructor(
    private readonly orders: OrderRepository,
    private readonly customers: CustomerLookup,
  ) {}

  async execute(customerId: string, quantity: number): Promise<Order> {
    if (!(await this.customers.exists(customerId))) throw new CustomerNotFoundError(customerId);
    const order = new Order(newId('o'), customerId, quantity);
    await this.orders.save(order);
    return order;
  }
}
