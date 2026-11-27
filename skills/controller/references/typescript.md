# Controller — TypeScript / JavaScript

Files: `src/modules/<module>/infrastructure/controllers/<name>-controller.ts`, with the HTTP request DTO beside it (`<name>-http-request.ts`). The examples use Express 5, from `examples/shop`. Route registration and the last-resort error handler live in `src/platform/web/`.

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
import type { RegisterCustomerHttpRequest } from './register-customer-http-request';

export class RegisterCustomerController {
  constructor(private readonly useCase: RegisterCustomerInteractor) {}

  async handle(req: Request, res: Response): Promise<void> {
    const body = (req.body ?? {}) as Partial<RegisterCustomerHttpRequest>;
    try {
      // Coerce, do not validate business rules: the entity rejects empty or malformed values.
      const response = await this.useCase.execute({ name: String(body.name ?? ''), email: String(body.email ?? '') });
      res.status(201).json(response);
    } catch (error) {
      // Known, typed failures → status. Never by message text.
      if (error instanceof InvalidCustomerError) {
        res.status(400).json({ message: error.message });
        return;
      }
      if (error instanceof EmailAlreadyRegisteredError) {
        res.status(409).json({ message: error.message });
        return;
      }
      throw error; // unexpected → the error handler in platform/web answers 500 without internals
    }
  }
}
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

```typescript
// src/platform/web/app.ts — framework wiring only; handlers come ready-made from main/
import express, { type Express, type NextFunction, type Request, type Response } from 'express';

export interface RouteHandlers {
  registerCustomer: (req: Request, res: Response) => Promise<void>;
}

export function buildHttpApp(handlers: RouteHandlers): Express {
  const app = express();
  app.use(express.json());
  app.post('/customers', handlers.registerCustomer); // Express 5 forwards a rejected promise to the handler below

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const malformed = typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.parse.failed';
    if (!malformed) console.error('Unhandled error:', err); // log it, never send it
    res.status(malformed ? 400 : 500).json({ message: malformed ? 'Malformed JSON' : 'Unexpected error' });
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

function fakeResponse() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe('RegisterCustomerController', () => {
  it('maps a duplicate email to 409', async () => {
    const useCase = { execute: vi.fn().mockRejectedValue(new EmailAlreadyRegisteredError('a@b.co')) };
    const res = fakeResponse();
    await new RegisterCustomerController(useCase as unknown as RegisterCustomerInteractor)
      .handle({ body: { name: 'Ada', email: 'a@b.co' } } as Request, res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('rethrows an unexpected failure', async () => {
    const boom = new Error('database is locked');
    const useCase = { execute: vi.fn().mockRejectedValue(boom) };
    await expect(new RegisterCustomerController(useCase as unknown as RegisterCustomerInteractor)
      .handle({ body: {} } as Request, fakeResponse() as unknown as Response)).rejects.toBe(boom);
  });
});
```
