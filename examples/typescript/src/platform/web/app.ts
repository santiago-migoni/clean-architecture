// src/platform/web/app.ts — builds the Express app: parsing, routes and the last-resort error handler.
// Framework wiring only. It receives ready-made handlers from main/, and the locales the app speaks.
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { createTranslator } from '../i18n/translator';
import { negotiateLocale } from './locale';
import { webMessages } from './messages';
import { registerRoutes, type RouteHandlers } from './routes';

/** `locales[0]` is the default: the answer when the client asks for nothing the app speaks. */
export function buildHttpApp(handlers: RouteHandlers, locales: readonly string[]): Express {
  const app = express();
  const t = createTranslator(webMessages, locales[0]);
  const localeOf = (req: Request) => negotiateLocale(req.get('accept-language'), locales);

  app.use(express.json());
  registerRoutes(app, handlers, localeOf);

  // Last resort. Malformed JSON is the client's fault; anything else must never leak internals.
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const malformed = typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.parse.failed';
    // The client gets no internals, but the failure must not disappear: log every unexpected error.
    if (!malformed) console.error('Unhandled error:', err);
    const code = malformed ? 'MALFORMED_JSON' : 'UNKNOWN_ERROR';
    res.status(malformed ? 400 : 500).json({ code, message: t(localeOf(req), code) });
  });
  return app;
}
