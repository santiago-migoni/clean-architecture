// src/platform/web/routes.ts — route registration (framework wiring). No business logic.
import type { Express, Request, Response } from 'express';
import { placeOrderHandler, type PlaceOrderPair } from './place-order-route';

type Handler = (req: Request, res: Response) => Promise<void>;

export interface RouteHandlers {
  registerCustomer: Handler;
  getCustomer: Handler;
  makePlaceOrder: () => PlaceOrderPair;
}

export function registerRoutes(app: Express, handlers: RouteHandlers): void {
  app.post('/customers', handlers.registerCustomer);
  app.get('/customers/:id', handlers.getCustomer);
  app.post('/orders', placeOrderHandler(handlers.makePlaceOrder));
}
