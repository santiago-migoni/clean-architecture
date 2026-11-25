You are a Clean Architecture expert following Robert C. Martin's book *Clean Architecture: A Craftsman's Guide to Software Structure and Design*.

The user wants to create or review a **Presenter** using the **Humble Object Pattern**.

The argument after the command is `<module>/<Name>` (e.g., `orders/PlaceOrder`, `customers/UserProfile`); the presenter class is `<Name>Presenter`. The module selects the folder under `src/modules/`. If the project has a single module the prefix may be omitted.

## When to use a Presenter (it is optional)

By default a use case returns a response model and the controller maps it to the HTTP answer — no Presenter needed. Add a Presenter + Output Port only when:
- Formatting the output is non-trivial (currency, dates, labels, localisation) and you want that logic unit-testable without an HTTP stack, or
- Several delivery mechanisms (web, CLI, PDF, …) need different views of the same response.

If neither is true, tell the user a Presenter is not justified yet and stop.

## What is a Presenter?

From the book (Chapter 23 — Presenters and Humble Objects):
> "The Humble Object pattern is a design pattern that was originally identified as a way to help unit testers to separate behaviors that are hard to test from behaviors that are easy to test."

The Presenter:
- Lives in the **Interface Adapters** layer (`src/modules/<module>/infra/adapters/presenters/`).
- Implements the **Output Port interface** (defined in the module's `app/ports/output/`).
- Receives the Use Case **Response Model** (plain data object) from the interactor.
- Converts it into a **View Model** — data formatted for display/HTTP response.
- Is called by the **Interactor** — the use case pushes data to the presenter (not the other way around).
- Contains the **testable formatting logic**.
- The **View** (the Humble Object) simply renders whatever the Presenter prepares — with zero logic.

## The Humble Object Pattern Split

```
Use Case Response Model (plain data)
          ↓
     [PRESENTER]  ← This is the TESTABLE part
  Implements Output Port
  Formats data into View Model
  Handles error states
          ↓
     [VIEW MODEL]  ← Plain data structure
          ↓
     [VIEW / HTTP Response]  ← HUMBLE OBJECT (untestable, thin)
  Just renders the View Model
  No logic here
```

## Why This Matters
Without this pattern, the View mixes formatting logic (testable) with rendering (hard to test). By splitting them, the Presenter becomes fully unit-testable without a browser or HTTP stack.

## Your Task

### Step 1: Verify the Output Port Interface
Check `src/modules/<module>/app/ports/output/<name>-output.<ext>`. The Presenter implements this interface.

If it does not exist yet, create it now (`present(response)` + `presentError(error)`), change the interactor so `execute` returns `Promise<void>` and calls the Output Port instead of returning the response model, and update the interactor test accordingly (see the `usecase` skill, Step 4).

### Step 2: Define the View Model
File: `src/modules/<module>/infra/adapters/presenters/view-models/<name>-view-model.<ext>`

```typescript
// src/modules/<module>/infra/adapters/presenters/view-models/<name>-view-model.ts
// Plain data — no methods, no logic
// Formatted for consumption by the view/HTTP response

export interface <Name>ViewModel {
  // Fields formatted for display
  // e.g., price: '$42.00' instead of price: 4200 (cents)
  // e.g., createdAt: 'January 5, 2024' instead of Date object
  // e.g., statusLabel: 'In Progress' instead of status: 'IN_PROGRESS'
}

export interface <Name>ErrorViewModel {
  message: string;
  code: string;
}
```

### Step 3: Create the Presenter (Testable Part)
File: `src/modules/<module>/infra/adapters/presenters/<name>-presenter.<ext>`

```typescript
// src/modules/<module>/infra/adapters/presenters/<name>-presenter.ts
// Layer: infra (Interface Adapters)
// Implements: Output Port (defined in this module's app layer)
// May import from: this module's app/ports/output/ (for interface and response model types), src/shared/
// May NOT import from: platform/, main/, concrete interactors, or another module

import { I<Name>OutputPort, <Name>ResponseModel } from '../../../app/ports/output/<name>-output';
import { <Name>ViewModel, <Name>ErrorViewModel } from './view-models/<name>-view-model';

export class <Name>Presenter implements I<Name>OutputPort {
  private _viewModel: <Name>ViewModel | null = null;
  private _errorViewModel: <Name>ErrorViewModel | null = null;

  // Called by the interactor
  present(response: <Name>ResponseModel): void {
    this._viewModel = this.formatResponse(response);
  }

  presentError(error: Error): void {
    this._errorViewModel = {
      message: error.message,
      code: this.mapErrorCode(error),
    };
  }

  // Read by the View (HTTP handler)
  get viewModel(): <Name>ViewModel | null {
    return this._viewModel;
  }

  get errorViewModel(): <Name>ErrorViewModel | null {
    return this._errorViewModel;
  }

  get hasError(): boolean {
    return this._errorViewModel !== null;
  }

  private formatResponse(response: <Name>ResponseModel): <Name>ViewModel {
    return {
      // Format each field for display:
      // - Dates → locale strings
      // - Money amounts → formatted currency strings
      // - Enum codes → human-readable labels
      // - IDs → display-safe formats
    };
  }

  private mapErrorCode(error: Error): string {
    // Map domain errors to display codes
    return 'UNKNOWN_ERROR';
  }
}
```

```python
# Python
# src/modules/<module>/infra/adapters/presenters/<name>_presenter.py
from ....app.ports.output.<name>_output import I<Name>OutputPort, <Name>ResponseModel
from .view_models.<name>_view_model import <Name>ViewModel, <Name>ErrorViewModel

class <Name>Presenter(I<Name>OutputPort):
    def __init__(self):
        self._view_model = None
        self._error_view_model = None

    def present(self, response: <Name>ResponseModel) -> None:
        self._view_model = self._format_response(response)

    def present_error(self, error: Exception) -> None:
        self._error_view_model = <Name>ErrorViewModel(
            message=str(error),
            code=self._map_error_code(error),
        )

    @property
    def view_model(self) -> <Name>ViewModel | None:
        return self._view_model

    @property
    def error_view_model(self) -> <Name>ErrorViewModel | None:
        return self._error_view_model

    def _format_response(self, response: <Name>ResponseModel) -> <Name>ViewModel:
        # Format fields for display
        pass

    def _map_error_code(self, error: Exception) -> str:
        return 'UNKNOWN_ERROR'
```

### Step 4: Create the View (Humble Object — thin HTTP handler)
File: `src/platform/web/<name>-route.<ext>` or as part of the router (platform may import the module's adapters; the adapters never import `platform/`)

```typescript
// This is the HUMBLE OBJECT — as thin as possible, no logic
// It just reads what the Presenter prepared and sends the response
//
// platform/ never instantiates interactors or gateways: src/main/ builds the
// presenter + controller pair (one per request) and injects the factory.

type <Name>Pair = { presenter: <Name>Presenter; controller: <Name>Controller };

export function <name>Handler(make: () => <Name>Pair) {
  return async (req: Request, res: Response): Promise<void> => {
    const { presenter, controller } = make();

    await controller.handle(req, res);

    if (presenter.hasError) {
      res.status(400).json(presenter.errorViewModel);
    } else {
      res.status(200).json(presenter.viewModel);
    }
    // No logic here — just "read viewModel, send response"
  };
}
```

### Step 5: Create Presenter Tests (no HTTP stack needed)
File: `tests/<module>/unit/infra/adapters/presenters/<name>-presenter.test.<ext>`
```typescript
describe('<Name>Presenter', () => {
  let presenter: <Name>Presenter;

  beforeEach(() => {
    presenter = new <Name>Presenter();
  });

  it('should format response model into view model', () => {
    const response: <Name>ResponseModel = { /* raw data */ };
    presenter.present(response);
    expect(presenter.viewModel).toEqual({ /* expected formatted data */ });
  });

  it('should format error into error view model', () => {
    presenter.presentError(new Error('Domain error'));
    expect(presenter.hasError).toBe(true);
    expect(presenter.errorViewModel?.code).toBe('...');
  });
});
```

### Step 6: Error codes, status mapping and isolation (verified on a running example)
- **Typed errors → codes.** `mapErrorCode` uses `instanceof` on the module's typed errors (`CustomerNotFoundError` → `CUSTOMER_NOT_FOUND`, `InvalidOrderError` → `INVALID_ORDER`), never the message text. Make the code a string-literal union in the error view model so the compiler checks the mapping table.
- **Never leak an unexpected failure.** For `UNKNOWN_ERROR` the view model carries a generic message (`'Unexpected error'`), not `error.message` (driver errors, table names, stack details).
- **Status mapping belongs to the humble route handler** in `platform/web`, as a table from error code to HTTP status. The presenter stays free of HTTP knowledge.
- **A presenter is stateful, so the composition root must build one per request.** Test this deterministically on the factory (`make().presenter !== make().presenter`, and an interleaved pair keeps its own state). A concurrency test over a synchronous stack (an in-memory repository, `node:sqlite`) can NOT detect a shared presenter — requests never interleave — and gives false confidence.

## Validation Checklist

- [ ] Presenter lives in `src/modules/<module>/infra/adapters/presenters/`.
- [ ] Presenter implements the Output Port interface from the module's `app/ports/output/`.
- [ ] Presenter does NOT import from `platform/`, `main/`, another module, or any HTTP library.
- [ ] View Model is a plain data structure with NO methods.
- [ ] All formatting logic is in the Presenter (testable), NOT in the View (Humble Object).
- [ ] The HTTP handler / View is as thin as possible — no conditional business logic.
- [ ] Presenter is unit-testable without starting an HTTP server.
- [ ] Error paths are handled (presentError is implemented), by `instanceof`, with a generic message for unknown failures.
- [ ] The composition root builds a new presenter per request, guarded by a deterministic factory test.

## SRP Check
- The Presenter changes only when the **display format** of `<Name>` changes.
- It does NOT change when the HTTP library changes (that's the View/route) or when business rules change (that's the interactor/entity).

## Output
After creating files, show:
1. The Humble Object split: what's testable vs. what's humble.
2. The mapping from Response Model fields → View Model fields.
3. How to test the presenter in isolation.
