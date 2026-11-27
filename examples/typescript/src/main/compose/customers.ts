// src/main/compose/customers.ts — composition of the `customers` module.
// Only src/main/ may import concrete classes from modules and platform.
import { readFileSync } from 'node:fs';
import type { Request, Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type { Migration } from '../../platform/db/migrate';
import type { IGetCustomerUseCase } from '../../modules/customers/application/ports/input/get-customer';
import { SqlCustomerRepository } from '../../modules/customers/infrastructure/gateways/sql-customer-repository';
import { GetCustomerInteractor } from '../../modules/customers/application/interactors/get-customer';
import { RegisterCustomerInteractor } from '../../modules/customers/application/interactors/register-customer';
import { RegisterCustomerController } from '../../modules/customers/infrastructure/controllers/register-customer-controller';
import { GetCustomerController } from '../../modules/customers/infrastructure/controllers/get-customer-controller';

const sql = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

export const customersMigrations: Migration[] = [
  { name: 'customers/001-create-customers', sql: sql('../../modules/customers/infrastructure/gateways/migrations/001-create-customers.sql') },
];

export function composeCustomers({ db, newId }: { db: DatabaseSync; newId: () => string }) {
  const repository = new SqlCustomerRepository(db);

  // The input port is what other modules are allowed to use — expose it explicitly.
  const getCustomer: IGetCustomerUseCase = new GetCustomerInteractor(repository);
  const registerCustomer = new RegisterCustomerInteractor(repository, newId);

  // Controllers are stateless: build once. GetCustomer depends on the INPUT PORT, RegisterCustomer on the interactor.
  const registerController = new RegisterCustomerController(registerCustomer);
  const getController = new GetCustomerController(getCustomer);

  return {
    ports: { getCustomer },
    routes: {
      registerCustomer: (req: Request, res: Response) => registerController.handle(req, res),
      getCustomer: (req: Request, res: Response) => getController.handle(req, res),
    },
  };
}
