// Layer: platform (frameworks & drivers). Creates the DB client; main/ injects it into the gateways.
import { DatabaseSync } from 'node:sqlite';

export function createDbConnection(path = ':memory:'): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}
