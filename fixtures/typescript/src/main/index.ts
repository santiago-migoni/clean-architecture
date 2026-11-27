// Composition root: the only place that wires modules and layers.
import { GetCustomerInteractor } from '../modules/customers/application/interactors/get-customer';
import { CustomerInMemoryRepository } from '../modules/customers/infrastructure/gateways/in-memory/customer-in-memory-repository';
import { PlaceOrderInteractor } from '../modules/orders/application/interactors/place-order';
import { CustomerLookupGateway } from '../modules/orders/infrastructure/gateways/customer-lookup-gateway';
import { OrderInMemoryRepository } from '../modules/orders/infrastructure/gateways/in-memory/order-in-memory-repository';

export async function createApp() {
  const customers = new CustomerInMemoryRepository({ id: 'c-1', name: 'Ada' });
  const lookup = new CustomerLookupGateway(new GetCustomerInteractor(customers));
  const placeOrder = new PlaceOrderInteractor(new OrderInMemoryRepository(), lookup);
  // The web driver is loaded lazily: a dynamic import is still a dependency.
  const { startServer } = await import('../platform/web/server.mjs');
  return startServer({
    'POST /orders': async () => [201, await placeOrder.execute('c-1', 1)],
  });
}
