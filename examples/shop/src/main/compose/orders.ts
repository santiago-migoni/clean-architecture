// src/main/compose/orders.ts — composition of the `orders` module.
import { readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import type { Migration } from '../../platform/db/migrate';
import type { IGetCustomerUseCase } from '../../modules/customers/application/ports/input/get-customer';
import { SqlOrderRepository } from '../../modules/orders/infrastructure/gateways/sql-order-repository';
import { CustomerLookupGateway } from '../../modules/orders/infrastructure/gateways/customer-lookup-gateway';
import { PlaceOrderInteractor } from '../../modules/orders/application/interactors/place-order';
import { PlaceOrderPresenter } from '../../modules/orders/infrastructure/presenters/place-order-presenter';
import { PlaceOrderController } from '../../modules/orders/infrastructure/controllers/place-order-controller';

const sql = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

export const ordersMigrations: Migration[] = [
  { name: 'orders/001-create-orders', sql: sql('../../modules/orders/infrastructure/gateways/migrations/001-create-orders.sql') },
];

export interface OrdersDeps {
  db: DatabaseSync;
  newId: () => string;
  getCustomer: IGetCustomerUseCase; // customers' INPUT port — the only legal cross-module link
}

export function composeOrders({ db, newId, getCustomer }: OrdersDeps) {
  const orderRepository = new SqlOrderRepository(db);
  const customerLookup = new CustomerLookupGateway(getCustomer);

  // PlaceOrder has an Output Port: presenters are stateful (they hold the view model), so build
  // presenter + interactor + controller PER REQUEST and never share a presenter between requests.
  const makePlaceOrder = () => {
    const presenter = new PlaceOrderPresenter();
    const interactor = new PlaceOrderInteractor(presenter, orderRepository, customerLookup, newId);
    return { presenter, controller: new PlaceOrderController(interactor) };
  };

  return { routes: { makePlaceOrder } };
}
