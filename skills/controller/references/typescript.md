# Controller — TypeScript / JavaScript

Files: `src/modules/<module>/infrastructure/controllers/<name>-controller.ts`, with the HTTP request DTO beside it (`<name>-http-request.ts`). The examples use Express 5, from `examples/typescript`. Route registration and the last-resort error handler live in `src/platform/web/`.

## Default style — the controller maps the response model to HTTP

```typescript
// src/modules/customers/infrastructure/controllers/register-customer-http-request.ts
// The body exactly as it arrives. The use case request uses its own vocabulary.
export interface RegisterCustomerHttpRequest {
  name: string;
  email: string;
}
```

```typescript
// src/modules/customers/infrastructure/controllers/register-customer-controller.ts
// May import this module's application/ and domain/ (types, errors) and shared/; never platform/, main/ or another module.
import type { Request, Response } from 'express'; // framework knowledge is confined to this layer
import { RegisterCustomerInteractor } from '../../application/interactors/register-customer';
import { EmailAlreadyRegisteredError } from '../../application/errors/email-already-registered-error';
import { InvalidCustomerError } from '../../domain/errors/invalid-customer-error';
import type { Translate } from './customer-messages';
import type { RegisterCustomerHttpRequest } from './register-customer-http-request';

export class RegisterCustomerController {
  constructor(private readonly useCase: RegisterCustomerInteractor, private readonly t: Translate) {}

  // locale: negotiated by platform/web from Accept-Language
  async handle(req: Request, res: Response, locale: string): Promise<void> {
    const body = (req.body ?? {}) as Partial<RegisterCustomerHttpRequest>;
    try {
      // Coerce, do not validate business rules: the entity rejects empty or malformed values.
      const response = await this.useCase.execute({ name: String(body.name ?? ''), email: String(body.email ?? '') });
      res.status(201).json(response);
    } catch (error) {
      // Known, typed failures → a status, a stable code and a text in the request's language.
      // By type and reason, never by message text (the message is for logs).
      if (error instanceof InvalidCustomerError) {
        res.status(400).json({ code: 'INVALID_CUSTOMER', message: this.t(locale, `INVALID_CUSTOMER.${error.reason}`) });
        return;
      }
      if (error instanceof EmailAlreadyRegisteredError) {
        res.status(409).json({ code: 'EMAIL_ALREADY_REGISTERED', message: this.t(locale, 'EMAIL_ALREADY_REGISTERED', { email: error.email }) });
        return;
      }
      throw error; // unexpected → the error handler in platform/web answers 500 without internals
    }
  }
}
```

The texts are the module's own, beside the controller that writes them. The translator is injected by `main/`; the
implementation lives in `platform/i18n/`, which a module never imports:

```typescript
// src/modules/customers/infrastructure/controllers/customer-messages.ts
export const customerMessages = {
  en: {
    'INVALID_CUSTOMER.NAME_REQUIRED': 'Customer name must not be empty',
    'INVALID_CUSTOMER.INVALID_EMAIL': 'Customer email is not valid',
    EMAIL_ALREADY_REGISTERED: 'Email {email} is already registered',
  },
  es: {
    'INVALID_CUSTOMER.NAME_REQUIRED': 'El nombre del cliente no puede estar vacío',
    'INVALID_CUSTOMER.INVALID_EMAIL': 'El email del cliente no es válido',
    EMAIL_ALREADY_REGISTERED: 'El email {email} ya está registrado',
  },
};

// What the controller needs to turn a key into text (main/ injects platform/i18n's implementation).
export type Translate = (locale: string, key: string, params?: Readonly<Record<string, string>>) => string;
```

## With an Output Port — the controller never touches the response

```typescript
// src/modules/orders/infrastructure/controllers/place-order-controller.ts
import type { Request } from 'express';
import { PlaceOrderInteractor, PlaceOrderRequest } from '../../application/interactors/place-order';
import type { PlaceOrderHttpRequest } from './place-order-http-request';

export class PlaceOrderController {
  constructor(private readonly useCase: PlaceOrderInteractor) {}

  async handle(req: Request): Promise<void> {
    const body = (req.body ?? {}) as Partial<PlaceOrderHttpRequest>;
    // HTTP vocabulary (items) → use case vocabulary (lines)
    const request: PlaceOrderRequest = {
      customerId: String(body.customerId ?? ''),
      lines: Array.isArray(body.items)
        ? body.items.map((i) => ({
            productId: String(i?.productId ?? ''),
            quantity: Number(i?.quantity),
            unitPriceCents: Number(i?.unitPriceCents),
          }))
        : [],
    };
    await this.useCase.execute(request);
  }
}
```

The thin route handler in `platform/web/` reads the presenter afterwards (see the `presenter` skill).

## Route registration and the last-resort handler (platform/web)

`platform/web/` also negotiates the locale of each request: `Accept-Language` is an HTTP detail. `negotiateLocale`
(in `platform/web/locale.ts`) returns the first language the client wants that the app speaks, `locales[0]` otherwise.

```typescript
// src/platform/web/app.ts — framework wiring only; handlers come ready-made from main/, and the locales the app speaks
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { createTranslator } from '../i18n/translator';
import { negotiateLocale } from './locale';
import { webMessages } from './messages';

export interface RouteHandlers {
  registerCustomer: (req: Request, res: Response, locale: string) => Promise<void>;
}

export function buildHttpApp(handlers: RouteHandlers, locales: readonly string[]): Express {
  const app = express();
  const t = createTranslator(webMessages, locales[0]);
  const localeOf = (req: Request) => negotiateLocale(req.get('accept-language'), locales);

  app.use(express.json());
  // Express 5 forwards a rejected promise to the handler below
  app.post('/customers', (req, res) => handlers.registerCustomer(req, res, localeOf(req)));

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const malformed = typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.parse.failed';
    if (!malformed) console.error('Unhandled error:', err); // log it, never send it
    const code = malformed ? 'MALFORMED_JSON' : 'UNKNOWN_ERROR';
    res.status(malformed ? 400 : 500).json({ code, message: t(localeOf(req), code) });
  });
  return app;
}
```

## Test — the use case is replaced, no server is started

```typescript
// tests/customers/unit/infrastructure/controllers/register-customer-controller.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { RegisterCustomerController } from '@/modules/customers/infrastructure/controllers/register-customer-controller';
import type { RegisterCustomerInteractor } from '@/modules/customers/application/interactors/register-customer';
import { EmailAlreadyRegisteredError } from '@/modules/customers/application/errors/email-already-registered-error';
import { customerMessages } from '@/modules/customers/infrastructure/controllers/customer-messages';
import { createTranslator } from '@/platform/i18n/translator';

const t = createTranslator(customerMessages, 'en');

function fakeResponse() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe('RegisterCustomerController', () => {
  it('maps a duplicate email to 409, with its code and a text in the request language', async () => {
    const useCase = { execute: vi.fn().mockRejectedValue(new EmailAlreadyRegisteredError('a@b.co')) };
    const res = fakeResponse();
    await new RegisterCustomerController(useCase as unknown as RegisterCustomerInteractor, t)
      .handle({ body: { name: 'Ada', email: 'a@b.co' } } as Request, res as unknown as Response, 'es');
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ code: 'EMAIL_ALREADY_REGISTERED', message: 'El email a@b.co ya está registrado' });
  });

  it('rethrows an unexpected failure', async () => {
    const boom = new Error('database is locked');
    const useCase = { execute: vi.fn().mockRejectedValue(boom) };
    await expect(new RegisterCustomerController(useCase as unknown as RegisterCustomerInteractor, t)
      .handle({ body: {} } as Request, fakeResponse() as unknown as Response, 'en')).rejects.toBe(boom);
  });
});
```
