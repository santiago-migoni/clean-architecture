// src/main/index.ts — MAIN COMPONENT (Composition Root)
// The ONLY place that knows every module and layer. Nothing imports from main/.
// It never reads the environment: server.ts loads the configuration (config.ts) and passes the values in.
// It exports a factory instead of listening, so tests can import the app without opening a port;
// the tiny entry point that listens is server.ts.
import { randomUUID } from 'node:crypto';
import { createDbConnection } from '../platform/db/connection';
import { runMigrations } from '../platform/db/migrate';
import { buildHttpApp } from '../platform/web/app';
import { composeCustomers, customersMigrations } from './compose/customers';
import { composeOrders, ordersMigrations } from './compose/orders';
import { LOCALES } from './locales';

export function createApp(options: { dbPath?: string; auditLog?: (line: string) => void } = {}) {
  // 1. Infrastructure (platform)
  const db = createDbConnection(options.dbPath ?? ':memory:');
  runMigrations(db, [...customersMigrations, ...ordersMigrations]);
  const newId = () => randomUUID();

  // 2. Compose modules in dependency order; the cross-module tie is an INPUT PORT
  const defaultLocale = LOCALES[0];
  const customers = composeCustomers({ db, newId, defaultLocale });
  const auditLog = options.auditLog ?? ((line: string) => console.log(`audit ${line}`));
  const orders = composeOrders({ db, newId, getCustomer: customers.ports.getCustomer, auditLog, defaultLocale });

  // 3. HTTP: routes of every module
  const app = buildHttpApp({ ...customers.routes, ...orders.routes }, LOCALES);
  return { app, db };
}
