// src/main/index.ts — MAIN COMPONENT (Composition Root)
// The ONLY place that knows every module and layer. Nothing imports from main/.
// Environment variables are read here and in server.ts, nowhere else.
// It exports a factory instead of listening, so tests can import the app without opening a port;
// the tiny entry point that listens is server.ts.
import { randomUUID } from 'node:crypto';
import { createDbConnection } from '../platform/db/connection';
import { runMigrations } from '../platform/db/migrate';
import { buildHttpApp } from '../platform/web/app';
import { composeCustomers, customersMigrations } from './compose/customers';
import { composeOrders, ordersMigrations } from './compose/orders';

export function createApp(options: { dbPath?: string; auditLog?: (line: string) => void } = {}) {
  // 1. Infrastructure (platform)
  const db = createDbConnection(options.dbPath ?? process.env.DB_PATH ?? ':memory:');
  runMigrations(db, [...customersMigrations, ...ordersMigrations]);
  const newId = () => randomUUID();

  // 2. Compose modules in dependency order; the cross-module tie is an INPUT PORT
  const customers = composeCustomers({ db, newId });
  const auditLog = options.auditLog ?? ((line: string) => console.log(`audit ${line}`));
  const orders = composeOrders({ db, newId, getCustomer: customers.ports.getCustomer, auditLog });

  // 3. HTTP: routes of every module
  const app = buildHttpApp({ ...customers.routes, ...orders.routes });
  return { app, db };
}
