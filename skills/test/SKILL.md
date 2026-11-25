You are a Clean Architecture expert following Robert C. Martin's book *Clean Architecture: A Craftsman's Guide to Software Structure and Design*.

The user wants to create tests that comply with the **Test Boundary** principle.

The argument after the command is `<module>/<Name>` of the class/use case/entity to test (e.g., `orders/PlaceOrderInteractor`, `orders/Order`, `orders/OrderGateway`). Tests mirror the source tree: `tests/<module>/unit/{domain,app,infra/adapters}/`, `tests/<module>/integration/infra/adapters/gateways/`, and `tests/e2e/`.

In the examples below, `@/` is an alias for `src/` (`moduleNameMapper` in Jest, `paths` in tsconfig, `pythonpath` in pytest) so that test imports do not depend on directory depth.

## The Test Boundary (Chapter 28)

From the book:
> "Tests are not outside the system; rather, they are parts of the system that must be well designed and well managed. Tests that are strongly coupled to the system are fragile — they break whenever any part of the system changes."

Key principles:
1. **Tests follow the Dependency Rule** — tests are in the outermost circle; nothing in the system depends on tests.
2. **Tests must be isolated** — use case tests must not touch the DB, HTTP, or any framework.
3. **Tests should be fragile-free** — don't test implementation details; test behavior through interfaces.
4. **Test API** — create a specific API for tests that lets the system be put into a testable state without going through the production UI.
5. **Tests follow the Module Rule too** — a test of module A must not import module B's `domain/` or `infra/`. Fake the cross-module port instead (see Test Type 2).

## Test Pyramid in Clean Architecture

```
                  /\
                 /  \
                / E2E \        ← Few, slow, fragile
               /      \          (tests the whole system through the UI/HTTP)
              /────────\
             /Integration\    ← Moderate, tests gateway/adapter wiring
            /            \       (uses real DB, but in-memory or test schema)
           /──────────────\
          /   Unit Tests   \  ← Many, fast, pure
         /  (entities &     \    (no I/O, no framework, no mocks of inner layers)
        /   use cases)       \
       /─────────────────────\
```

## Your Task

Determine the type of target (entity, use case, gateway, controller, presenter) and generate the appropriate test file.

### Test Type 1: Entity Tests

File: `tests/<module>/unit/domain/<entity-name>.test.<ext>`

```typescript
// Entity tests need NO mocks — entities are pure
import { Order, OrderId } from '@/modules/orders/domain/order';

describe('Order Entity', () => {

  describe('creation', () => {
    it('should create a valid Order', () => {
      const order = Order.create({
        id: 'order-1' as OrderId,
        customerId: 'cust-1',
        items: [{ productId: 'p1', quantity: 2, unitPrice: 1000 }],
        status: 'PENDING',
      });
      expect(order.id).toBe('order-1');
      expect(order.status).toBe('PENDING');
    });

    it('should reject Order with no items', () => {
      expect(() => Order.create({
        id: 'order-1' as OrderId,
        customerId: 'cust-1',
        items: [],
        status: 'PENDING',
      })).toThrow('Order must have at least one item');
    });
  });

  describe('critical business rules', () => {
    it('should allow cancellation when PENDING', () => {
      const order = Order.create({ /* ... */ });
      expect(order.canBeCancelled()).toBe(true);
    });

    it('should not allow cancellation when SHIPPED', () => {
      const order = Order.reconstitute({ /* ..., status: 'SHIPPED' */ });
      expect(order.canBeCancelled()).toBe(false);
    });

    it('should calculate total correctly', () => {
      const order = Order.create({ /* items with prices */ });
      expect(order.total).toBe(2000); // 2 × 1000 cents
    });
  });

  describe('equality', () => {
    it('should equal another Order with the same id', () => {
      const a = Order.reconstitute({ id: 'order-1' as OrderId, /* ... */ });
      const b = Order.reconstitute({ id: 'order-1' as OrderId, /* ... */ });
      expect(a.equals(b)).toBe(true);
    });
  });
});
```

### Test Type 2: Use Case Interactor Tests

File: `tests/<module>/unit/app/<use-case-name>.test.<ext>`

```typescript
// Use case tests use an in-memory repository and fakes for outbound ports
// They do NOT use a real DB or HTTP
import { PlaceOrderInteractor } from '@/modules/orders/app/interactors/place-order';
import { IOrderRepository } from '@/modules/orders/app/ports/output/order-repository';
import { ICustomerLookup } from '@/modules/orders/app/ports/output/customer-lookup';
import { OrderInMemoryRepository } from '@/modules/orders/infra/adapters/gateways/in-memory/order-in-memory-repository';

describe('PlaceOrderInteractor', () => {
  let interactor: PlaceOrderInteractor;
  let repository: IOrderRepository;
  let customerLookup: jest.Mocked<ICustomerLookup>;

  beforeEach(() => {
    repository = new OrderInMemoryRepository(); // In-memory — no real DB (create it on demand with the gateway skill)
    // The `customers` module is NOT imported: its port is faked from orders' own vocabulary
    customerLookup = { exists: jest.fn().mockResolvedValue(true) };
    interactor = new PlaceOrderInteractor(repository, customerLookup);
  });

  describe('Happy Path', () => {
    it('should place a valid order and return the response model', async () => {
      const response = await interactor.execute({
        customerId: 'cust-1',
        items: [{ productId: 'p1', quantity: 1, unitPrice: 1000 }],
      });

      expect(response).toEqual(
        expect.objectContaining({ orderId: expect.any(String), status: 'PENDING' })
      );
    });

    it('should persist the order to the repository', async () => {
      await interactor.execute({ customerId: 'cust-1', items: [/* ... */] });

      const allOrders = await repository.findAll();
      expect(allOrders).toHaveLength(1);
    });
  });

  describe('Error Cases', () => {
    it('should reject when items list is empty', async () => {
      await expect(interactor.execute({ customerId: 'cust-1', items: [] }))
        .rejects.toThrow(/item/);
    });

    it('should reject when customer is not found', async () => {
      customerLookup.exists.mockResolvedValue(false);
      await expect(interactor.execute({ customerId: 'missing', items: [/* ... */] }))
        .rejects.toThrow();
    });
  });
});
```

**Variant with an Output Port** (only if the use case has one): the interactor returns `void`; mock the port and assert on it instead of on the return value / thrown error:
```typescript
const outputPort: jest.Mocked<IPlaceOrderOutputPort> = { present: jest.fn(), presentError: jest.fn() };
interactor = new PlaceOrderInteractor(outputPort, repository, customerLookup);
// ...
expect(outputPort.present).toHaveBeenCalledWith(expect.objectContaining({ status: 'PENDING' }));
expect(outputPort.presentError).not.toHaveBeenCalled();
```

### Test Type 3: Presenter Tests (only if the use case has a Presenter)

File: `tests/<module>/unit/infra/adapters/presenters/<name>-presenter.test.<ext>`

```typescript
// Presenter tests need NO HTTP stack
import { PlaceOrderPresenter } from '@/modules/orders/infra/adapters/presenters/place-order-presenter';

describe('PlaceOrderPresenter', () => {
  let presenter: PlaceOrderPresenter;

  beforeEach(() => {
    presenter = new PlaceOrderPresenter();
  });

  it('should format the response model into a view model', () => {
    presenter.present({
      orderId: 'order-123',
      totalCents: 4200,
      createdAt: new Date('2024-01-05T10:00:00Z'),
      status: 'PENDING',
    });

    expect(presenter.viewModel).toEqual({
      orderId: 'order-123',
      total: '$42.00',
      createdAt: 'January 5, 2024',
      statusLabel: 'Pending',
    });
    expect(presenter.hasError).toBe(false);
  });

  it('should format error into an error view model', () => {
    presenter.presentError(new Error('Order creation failed'));

    expect(presenter.hasError).toBe(true);
    expect(presenter.errorViewModel?.message).toBe('Order creation failed');
  });
});
```

### Test Type 4: Gateway Integration Tests

File: `tests/<module>/integration/infra/adapters/gateways/<name>-repository-impl.test.<ext>`

```typescript
// Integration tests use a REAL database (test schema)
// These are separate from unit tests and require DB setup
import { OrderRepositoryImpl } from '@/modules/orders/infra/adapters/gateways/order-repository-impl';
import { Order, OrderId } from '@/modules/orders/domain/order';
// import test DB setup helpers

describe('OrderRepositoryImpl', () => {
  let repository: OrderRepositoryImpl;

  beforeAll(async () => {
    // Connect to test database
  });

  afterEach(async () => {
    // Clear test data between tests
  });

  afterAll(async () => {
    // Disconnect
  });

  it('should save and retrieve an order by id', async () => {
    const order = Order.create({ /* ... */ });
    await repository.save(order);

    const found = await repository.findById(order.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(order.id);
    // Check domain fields are correctly mapped
  });

  it('should return null for non-existent id', async () => {
    const found = await repository.findById('does-not-exist' as OrderId);
    expect(found).toBeNull();
  });
});
```

### Test Type 5: Controller Tests

File: `tests/<module>/unit/infra/adapters/controllers/<name>-controller.test.<ext>`

```typescript
// Controller tests stub the use case — the Input Port if the module has one, otherwise the
// interactor's `execute` (an object with just `execute` is enough; no real interactor, no DB)
import { PlaceOrderController } from '@/modules/orders/infra/adapters/controllers/place-order-controller';

describe('PlaceOrderController', () => {
  it('should map HTTP request to use case request model', async () => {
    const mockUseCase = { execute: jest.fn().mockResolvedValue({ orderId: 'o-1' }) };
    const controller = new PlaceOrderController(mockUseCase as any);

    const mockReq = { body: { customerId: 'cust-1', items: [{ productId: 'p1', qty: 2 }] } };
    const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await controller.handle(mockReq as any, mockRes as any);

    expect(mockUseCase.execute).toHaveBeenCalledWith({
      customerId: 'cust-1',
      items: [{ productId: 'p1', quantity: 2 }], // mapped from 'qty' to 'quantity'
    });
    expect(mockRes.json).toHaveBeenCalledWith({ orderId: 'o-1' }); // response model mapped to HTTP
  });
});
```

### Test Type 6: Cross-Module Gateway Tests

File: `tests/<module>/unit/infra/adapters/gateways/<other>-lookup-gateway.test.<ext>`

```typescript
// The gateway is the ONLY adapter allowed to touch another module — and only its input port.
// Fake that input port; never import the other module's domain or infra.
import { CustomerLookupGateway } from '@/modules/orders/infra/adapters/gateways/customer-lookup-gateway';
import { IGetCustomerUseCase } from '@/modules/customers/app/ports/input/get-customer';

it('translates the customers module answer into orders vocabulary', async () => {
  const getCustomer: jest.Mocked<IGetCustomerUseCase> = { execute: jest.fn() };
  const gateway = new CustomerLookupGateway(getCustomer);
  // ... arrange the fake input port, call gateway.exists('cust-1'), assert the mapped result
});
```

## Test Configuration Files

### Jest config (TypeScript):
`moduleNameMapper` must be repeated inside each project — Jest does not inherit it from the root when `projects` is used.
```json
{
  "jest": {
    "projects": [
      {
        "displayName": "unit",
        "testMatch": ["<rootDir>/tests/*/unit/**/*.test.ts"],
        "testEnvironment": "node",
        "moduleNameMapper": { "^@/(.*)$": "<rootDir>/src/$1" }
      },
      {
        "displayName": "integration",
        "testMatch": ["<rootDir>/tests/*/integration/**/*.test.ts"],
        "testEnvironment": "node",
        "moduleNameMapper": { "^@/(.*)$": "<rootDir>/src/$1" },
        "globalSetup": "<rootDir>/tests/setup/integration.ts"
      }
    ]
  }
}
```

### pytest config (Python):
```ini
[pytest]
markers =
    unit: Pure unit tests (no I/O)
    integration: Integration tests (requires DB)
    e2e: End-to-end tests (requires full stack)
```

## Validation Checklist

- [ ] Unit tests for entities: zero mocks, zero I/O, test all business rules.
- [ ] Unit tests for use cases: in-memory repository and fakes for outbound ports (mock the Output Port only if the use case has one).
- [ ] Use case tests do NOT connect to a real database.
- [ ] Integration tests are in a separate directory and test suite.
- [ ] Presenter tests (if a Presenter exists) run without starting an HTTP server.
- [ ] A test of one module never imports another module's `domain/` or `infra/` (cross-module ports are faked).
- [ ] Controller tests mock the use case interface.
- [ ] No business logic is tested only in integration or e2e tests.
- [ ] Test files themselves follow the Dependency Rule and the Module Rule (test code can only import from inner layers of the module under test + test utilities).

## Output
After creating test files, provide:
1. Test coverage breakdown by layer.
2. Which tests need infrastructure (DB, network) and which don't.
3. How to run only the fast unit tests: `npm test -- --project=unit` or equivalent.
