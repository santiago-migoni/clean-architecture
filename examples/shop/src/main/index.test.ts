// src/main/index.test.ts — TEST composition root: same wiring, in-memory implementations of the SAME ports.
import type { Request, Response } from 'express';
import { buildHttpApp } from '../platform/web/app';
import { CustomerInMemoryRepository } from '../modules/customers/infrastructure/gateways/in-memory/customer-in-memory-repository';
import { OrderInMemoryRepository } from '../modules/orders/infrastructure/gateways/in-memory/order-in-memory-repository';
import { GetCustomerInteractor } from '../modules/customers/application/interactors/get-customer';
import { RegisterCustomerInteractor } from '../modules/customers/application/interactors/register-customer';
import { RegisterCustomerController } from '../modules/customers/infrastructure/controllers/register-customer-controller';
import { GetCustomerController } from '../modules/customers/infrastructure/controllers/get-customer-controller';
import { PlaceOrderInteractor } from '../modules/orders/application/interactors/place-order';
import { PlaceOrderPresenter } from '../modules/orders/infrastructure/presenters/place-order-presenter';
import { PlaceOrderController } from '../modules/orders/infrastructure/controllers/place-order-controller';
import { CustomerLookupGateway } from '../modules/orders/infrastructure/gateways/customer-lookup-gateway';

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
