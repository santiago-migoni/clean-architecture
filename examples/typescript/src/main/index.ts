// src/main/index.ts — MAIN COMPONENT (Composition Root)
// The ONLY place that knows every module and layer. Nothing imports from main/.
// It never reads the environment: server.ts loads the configuration (config.ts) and passes the values in.
// It exports a factory instead of listening, so tests can import the app without opening a port;
// the tiny entry point that listens is server.ts.
import { randomUUID } from 'node:crypto';
import { createDbConnection } from '../platform/db/connection';
import { runMigrations } from '../platform/db/migrate';
import { InProcessBus } from '../platform/events/in-process-bus';
import { buildHttpApp } from '../platform/web/app';
import { composeCustomers, customersMigrations } from './compose/customers';
import { composeOrders, ordersMigrations } from './compose/orders';
import { composeLoyalty, loyaltyMigrations, sqlAwards } from './compose/loyalty';
import { ORDER_PLACED_V1, type OrderPlacedV1 } from '../modules/orders/application/ports/published/order-placed-v1';
import { LOCALES } from './locales';

export function createApp(options: { dbPath?: string; auditLog?: (line: string) => void } = {}) {
  // 1. Infrastructure (platform)
  const db = createDbConnection(options.dbPath ?? ':memory:');
  runMigrations(db, [...customersMigrations, ...ordersMigrations, ...loyaltyMigrations]);
  const newId = () => randomUUID();
  // A failing subscriber is logged and never fails the publisher (see platform/events).
  const bus = new InProcessBus((error, event) => console.error(`Subscriber failed on ${event.type}:`, error));

  // 2. Compose modules in dependency order. Two kinds of tie between modules: orders CALLS customers through its
  //    input port; loyalty REACTS to orders' published event, wired here as a subscription.
  const defaultLocale = LOCALES[0];
  const customers = composeCustomers({ db, newId, defaultLocale });
  const orders = composeOrders({ db, newId, getCustomer: customers.ports.getCustomer, publish: bus.publish, defaultLocale });
  const loyalty = composeLoyalty(sqlAwards(db));
  bus.subscribe<OrderPlacedV1>(ORDER_PLACED_V1, (event) => loyalty.subscribers.orderPlaced.handle(event));
  const auditLog = options.auditLog ?? ((line: string) => console.log(`audit ${line}`));
  bus.subscribeAll((event) => auditLog(JSON.stringify(event))); // every integration event, whoever publishes it

  // 3. HTTP: routes of every module
  const app = buildHttpApp({ ...customers.routes, ...orders.routes, ...loyalty.routes }, LOCALES);
  return { app, db };
}
