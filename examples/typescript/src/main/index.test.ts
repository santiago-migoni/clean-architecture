// src/main/index.test.ts — TEST composition root: same wiring, in-memory implementations of the SAME ports.
import type { Request, Response } from 'express';
import { buildHttpApp } from '../platform/web/app';
import { createTranslator } from '../platform/i18n/translator';
import { LOCALES } from './locales';
import { customerMessages } from '../modules/customers/infrastructure/controllers/customer-messages';
import { placeOrderMessages } from '../modules/orders/infrastructure/presenters/place-order-messages';
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
import { RecordingOrderEvents } from '../modules/orders/infrastructure/gateways/in-memory/recording-order-events';

export function bootstrapTestApp() {
  let n = 0;
  const newId = () => `id-${++n}`; // deterministic ids

  const customerRepository = new CustomerInMemoryRepository();
  const orderRepository = new OrderInMemoryRepository();
  const orderEvents = new RecordingOrderEvents();
  const getCustomer = new GetCustomerInteractor(customerRepository);
  const customersText = createTranslator(customerMessages, LOCALES[0]);
  const ordersText = createTranslator(placeOrderMessages, LOCALES[0]);
  const register = new RegisterCustomerController(new RegisterCustomerInteractor(customerRepository, newId), customersText);
  const get = new GetCustomerController(getCustomer, customersText);

  const app = buildHttpApp({
    registerCustomer: (req: Request, res: Response, locale: string) => register.handle(req, res, locale),
    getCustomer: (req: Request, res: Response, locale: string) => get.handle(req, res, locale),
    makePlaceOrder: (locale: string) => {
      const presenter = new PlaceOrderPresenter(ordersText, locale);
      const interactor = new PlaceOrderInteractor(presenter, orderRepository, new CustomerLookupGateway(getCustomer), newId, orderEvents);
      return { presenter, controller: new PlaceOrderController(interactor) };
    },
  }, LOCALES);
  return { app, orderRepository, orderEvents };
}
