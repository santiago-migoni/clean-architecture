You are a Clean Architecture expert following Robert C. Martin's book *Clean Architecture: A Craftsman's Guide to Software Structure and Design*.

The user wants to create or review a **Controller** — part of the Interface Adapters layer.

The argument after the command is `<module>/<Name>` (e.g., `orders/PlaceOrder`, `customers/RegisterCustomer`); the controller class is `<Name>Controller`. The module selects the folder under `src/modules/`. If the project has a single module the prefix may be omitted.

## What is a Controller?

From the book (Chapter 22 — The Clean Architecture):
> "The software in the interface adapters layer is a set of adapters that convert data from the format most convenient for the use cases and entities, to the format most convenient for some external agency such as the Database or the Web."

A Controller:
- Lives in the **Interface Adapters** layer (`src/modules/<module>/infra/adapters/controllers/`).
- Converts **framework input** (HTTP request, CLI args, message queue payload, gRPC call) → **Use Case Input Model** (a plain data object).
- Calls the use case: through the **Input Port** if the module defines one, otherwise directly on the module's **interactor** (same module, dependency still points inward).
- Does NOT process business logic.
- Maps the use case's **response model** to the delivery answer (HTTP status + JSON). If the use case has an Output Port, the Presenter does the formatting and the controller does not touch the response.
- Knows about the framework (e.g., Express `Request`/`Response`, FastAPI `Request`) but keeps that knowledge confined here.

## Data Flow

Default (no Output Port):
```
[Framework Request] → Controller (infra/adapters/controllers/)
      ↓ builds RequestModel (plain object)
  Interactor (app/interactors/)   — or its Input Port (app/ports/input/) when one exists
      ↓ returns ResponseModel
  Controller maps ResponseModel → HTTP response
```

With an Output Port:
```
[Framework Request] → Controller → [Input Port] → Interactor
      ↓ calls Output Port
  Presenter (infra/adapters/presenters/)
      ↓
  View Model / HTTP Response
```

## Your Task

### Step 1: Identify what the controller calls
- If `src/modules/<module>/app/ports/input/<name>.<ext>` exists, depend on that interface (required when another module or a second entry point also calls the use case).
- Otherwise depend on the interactor at `src/modules/<module>/app/interactors/<name>.<ext>`. Do not create an Input Port just for the controller.

### Step 2: Check for a Presenter
Only if the use case has an Output Port, pair the controller with its Presenter (see the `presenter` skill). Otherwise the controller maps the returned response model itself.

### Step 3: Create the Controller

File: `src/modules/<module>/infra/adapters/controllers/<name>-controller.<ext>`

#### TypeScript (Express example):
```typescript
// src/modules/<module>/infra/adapters/controllers/<name>-controller.ts
// Layer: infra (Interface Adapters)
// May import from: this module's app/ (interactor or input port), this module's domain/ (type references only), src/shared/
// May NOT import from: platform/, main/, or another module's domain/ or infra/

import { Request, Response } from 'express'; // Framework knowledge is OK here
import { <Name>Interactor, <Name>Request } from '../../../app/interactors/<name>';
// With an Input Port: import { I<Name>UseCase, <Name>Request } from '../../../app/ports/input/<name>';

export class <Name>Controller {
  constructor(private readonly useCase: <Name>Interactor /* or I<Name>UseCase */) {}

  async handle(req: Request, res: Response): Promise<void> {
    // Step 1: Extract and validate primitive data from the framework request
    const request: <Name>Request = {
      // Map req.body / req.params / req.query → request fields
      // Only primitive types — no Express objects leak into the use case
    };

    try {
      // Step 2: Call the use case and map its response model to HTTP
      const response = await this.useCase.execute(request);
      res.status(200).json(response);
    } catch (error) {
      // Map domain/application errors to HTTP statuses HERE — never inside the use case
      res.status(400).json({ message: (error as Error).message });
    }
  }
}

// Variant with an Output Port: the use case returns void and the Presenter fills the view model.
// The controller then only calls `await this.useCase.execute(request)` and never touches `res`;
// the thin route handler in platform/web/ reads presenter.viewModel (see the presenter skill).
```

#### Python (FastAPI example):
```python
# src/modules/<module>/infra/adapters/controllers/<name>_controller.py
# Layer: infra (Interface Adapters)

from fastapi import Request
from ....app.interactors.<name> import <Name>Interactor, <Name>Request
# With an Input Port: from ....app.ports.input.<name> import I<Name>UseCase

class <Name>Controller:
    def __init__(self, use_case: <Name>Interactor):  # or I<Name>UseCase
        self._use_case = use_case

    async def handle(self, request: Request) -> dict:
        body = await request.json()
        use_case_request = <Name>Request(
            # map fields
        )
        response = self._use_case.execute(use_case_request)
        return {}  # map the response model to the HTTP body
```

#### Java (Spring example):
```java
// src/modules/<module>/infra/adapters/controllers/<Name>Controller.java
// Layer: infra (Interface Adapters)

import org.springframework.web.bind.annotation.*;
import com.example.modules.<module>.app.interactors.<Name>Interactor;   // or app.ports.input.I<Name>UseCase
import com.example.modules.<module>.app.interactors.<Name>Request;
import com.example.modules.<module>.app.interactors.<Name>Response;

@RestController
@RequestMapping("/api/<resource>")
public class <Name>Controller {
    private final <Name>Interactor useCase;

    public <Name>Controller(<Name>Interactor useCase) {
        this.useCase = useCase;
    }

    @PostMapping
    public <Name>Response handle(@RequestBody <Name>HttpRequest httpRequest) {
        <Name>Request request = new <Name>Request(
            // map fields from httpRequest
        );
        return useCase.execute(request); // map the response model to the HTTP body here
    }
}
```

### Step 4: Define the HTTP Request DTO (if needed)
Keep the HTTP request schema separate from the Use Case Request Model:

```typescript
// src/modules/<module>/infra/adapters/controllers/dtos/<name>-http-request.ts
// HTTP-specific DTO — knows about HTTP, not about the use case
export interface <Name>HttpRequest {
  // Fields exactly as they arrive in the HTTP body
}
```

### Step 5: Wire in Main (reminder)
The controller should NOT instantiate its own use case. That happens in `src/main/`. Just note what dependencies are needed. Route registration for the module lives in `src/platform/web/` (it may import the module's controllers; the controller never imports `platform/`).

### Step 6: Error mapping and HTTP details (verified on a running example)
- **Map known, typed failures; never match on message text.** The use case throws typed errors (`InvalidXxxError` from `domain/errors/`, `XxxNotFoundError`/`XxxAlreadyRegisteredError` from `app/errors/`); the controller turns each into a status with `instanceof` (400 invalid, 404 not found, 409 conflict).
- **Never swallow the rest.** An error you do not recognise is rethrown. Express 5 forwards a rejected promise from an async handler to the error handler, which answers 500 without leaking internals (the handler lives in `platform/web/app.ts`).
- **Coerce, do not validate business rules.** `String(body.name ?? '')`, `Number(...)`, `Array.isArray(...)` keep a malformed body from crashing the controller; the entity then rejects `NaN` or empty values with its own typed error.
- **Translate vocabulary** when the API and the use case differ (HTTP `items` → request `lines`) in a separate HTTP DTO, so the API can change without touching the use case.
- With an **Output Port**, the controller signature is `handle(req)` and it never receives `res`; with the default style it is `handle(req, res)`.

## Validation Checklist

- [ ] Controller lives in `src/modules/<module>/infra/adapters/controllers/`.
- [ ] Controller does not import `platform/`, `main/`, or another module.
- [ ] Controller depends on the Input Port if the module defines one, otherwise on its own module's interactor — never on another module's classes.
- [ ] No business logic in the controller — only data translation (request in, response model → HTTP out, errors → status codes).
- [ ] If the use case has an Output Port, the controller does NOT touch `res` — the Presenter and the thin route handler do.
- [ ] Known failures are mapped by `instanceof` to a status; unknown ones are rethrown, never swallowed or converted into a generic 400.
- [ ] Framework objects (`Request`, `Response`) do NOT leak into the Use Case layer.
- [ ] Controller receives the use case via constructor injection (for testability).
- [ ] Input validation in the controller is limited to HTTP-level concerns (required fields, type coercion); business validation stays in the use case/entity.

## SRP Check
- The controller has one reason to change: when the **HTTP interface contract** changes (e.g., a field is renamed in the API).
- It does NOT change when business rules change (that's the interactor) or when the response format changes (that's the presenter).

## Output
After creating files, show:
1. What fields are extracted from the framework request.
2. How they map to the Use Case Request Model.
3. What the controller does NOT do (to clarify boundaries).
4. How to test the controller in isolation (mock the use case input port).
