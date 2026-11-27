// src/main/compose/loyalty.ts — composition of the `loyalty` module.
import { readFileSync } from 'node:fs';
import type { Request, Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type { Migration } from '../../platform/db/migrate';
import { SqlAwardRepository } from '../../modules/loyalty/infrastructure/gateways/sql-award-repository';
import type { IAwardRepository } from '../../modules/loyalty/application/ports/output/award-repository';
import { AwardPointsInteractor } from '../../modules/loyalty/application/interactors/award-points';
import { GetPointsInteractor } from '../../modules/loyalty/application/interactors/get-points';
import { OrderPlacedSubscriber } from '../../modules/loyalty/infrastructure/subscribers/order-placed-subscriber';
import { GetPointsController } from '../../modules/loyalty/infrastructure/controllers/get-points-controller';

const sql = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

export const loyaltyMigrations: Migration[] = [
  { name: 'loyalty/001-create-loyalty-awards', sql: sql('../../modules/loyalty/infrastructure/gateways/migrations/001-create-loyalty-awards.sql') },
];

export const sqlAwards = (db: DatabaseSync): IAwardRepository => new SqlAwardRepository(db);

// loyalty needs nothing from another module: it only REACTS to orders' event. main/ subscribes its subscriber.
export function composeLoyalty(awards: IAwardRepository) {
  const orderPlaced = new OrderPlacedSubscriber(new AwardPointsInteractor(awards));
  const getPoints = new GetPointsController(new GetPointsInteractor(awards));
  return {
    subscribers: { orderPlaced },
    routes: { getPoints: (req: Request, res: Response) => getPoints.handle(req, res) },
  };
}
