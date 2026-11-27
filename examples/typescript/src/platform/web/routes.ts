// src/platform/web/routes.ts — route registration (framework wiring). No business logic.
import type { Express, Request, Response } from 'express';
import { placeOrderHandler, type PlaceOrderPair } from './place-order-route';

// Every handler gets the locale negotiated here: reading Accept-Language is an HTTP detail.
type Handler = (req: Request, res: Response, locale: string) => Promise<void>;

export interface RouteHandlers {
  registerCustomer: Handler;
  getCustomer: Handler;
  makePlaceOrder: (locale: string) => PlaceOrderPair;
  getPoints: Handler;
}

export function registerRoutes(app: Express, handlers: RouteHandlers, localeOf: (req: Request) => string): void {
  app.post('/customers', (req, res) => handlers.registerCustomer(req, res, localeOf(req)));
  app.get('/customers/:id', (req, res) => handlers.getCustomer(req, res, localeOf(req)));
  app.post('/orders', placeOrderHandler(handlers.makePlaceOrder, localeOf));
  app.get('/loyalty/:customerId', (req, res) => handlers.getPoints(req, res, localeOf(req)));
}
