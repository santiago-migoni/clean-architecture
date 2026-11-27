// src/platform/web/app.ts — builds the Express app: parsing, routes and the last-resort error handler.
// Framework wiring only. It receives ready-made handlers from main/.
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { registerRoutes, type RouteHandlers } from './routes';

export function buildHttpApp(handlers: RouteHandlers): Express {
  const app = express();
  app.use(express.json());
  registerRoutes(app, handlers);

  // Last resort. Malformed JSON is the client's fault; anything else must never leak internals.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const malformed = typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.parse.failed';
    // The client gets no internals, but the failure must not disappear: log every unexpected error.
    if (!malformed) console.error('Unhandled error:', err);
    res.status(malformed ? 400 : 500).json({ message: malformed ? 'Malformed JSON' : 'Unexpected error' });
  });
  return app;
}
