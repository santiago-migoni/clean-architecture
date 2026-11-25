// src/main/index.test.ts — TEST composition root: same wiring, in-memory implementations of the SAME ports.
import type { Request, Response } from 'express';
import { buildHttpApp } from '../platform/web/app';
import { CustomerInMemoryRepository } from '../modules/customers/infra/adapters/gateways/in-memory/customer-in-memory-repository';
import { OrderInMemoryRepository } from '../modules/orders/infra/adapters/gateways/in-memory/order-in-memory-repository';
import { GetCustomerInteractor } from '../modules/customers/app/interactors/get-customer';
import { RegisterCustomerInteractor } from '../modules/customers/app/interactors/register-customer';
import { RegisterCustomerController } from '../modules/customers/infra/adapters/controllers/register-customer-controller';
import { GetCustomerController } from '../modules/customers/infra/adapters/controllers/get-customer-controller';
import { PlaceOrderInteractor } from '../modules/orders/app/interactors/place-order';
import { PlaceOrderPresenter } from '../modules/orders/infra/adapters/presenters/place-order-presenter';
import { PlaceOrderController } from '../modules/orders/infra/adapters/controllers/place-order-controller';
import { CustomerLookupGateway } from '../modules/orders/infra/adapters/gateways/customer-lookup-gateway';

export function bootstrapTestApp() {
  let n = 0;
  const newId = () => `id-${++n}`; // deterministic ids

  const customerRepository = new CustomerInMemoryRepository();
  const orderRepository = new OrderInMemoryRepository();
  const getCustomer = new GetCustomerInteractor(customerRepository);
  const register = new RegisterCustomerController(new RegisterCustomerInteractor(customerRepository, newId));
  const get = new GetCustomerController(getCustomer);

  const app = buildHttpApp({
    registerCustomer: (req: Request, res: Response) => register.handle(req, res),
    getCustomer: (req: Request, res: Response) => get.handle(req, res),
    makePlaceOrder: () => {
      const presenter = new PlaceOrderPresenter();
      const interactor = new PlaceOrderInteractor(presenter, orderRepository, new CustomerLookupGateway(getCustomer), newId);
      return { presenter, controller: new PlaceOrderController(interactor) };
    },
  });
  return { app, orderRepository };
}
