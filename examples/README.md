# Examples

One reference application, written three times: [TypeScript](typescript), [Python](python) and [Go](go). Each
version is idiomatic in its language, runs, and has its own tests in CI. They are also what the plugin's engine is
verified against (`npm run verify:example`): each must scan clean, and planted violations must be found.

The code in the skills' `references/<language>.md` comes from these projects.

## The application

Two modules, `customers` and `orders`, over SQLite and HTTP:

| Request | Answer |
|---|---|
| `POST /customers` `{name, email}` | `201 {customerId}` · `400 INVALID_CUSTOMER` · `409 EMAIL_ALREADY_REGISTERED` |
| `GET /customers/{id}` | `200 {id, name, email}` · `404 CUSTOMER_NOT_FOUND` |
| `POST /orders` `{customerId, items: [{productId, quantity, unitPriceCents}]}` | `201 {orderId, statusLabel, total}` · `404 CUSTOMER_NOT_FOUND` · `400 INVALID_ORDER` |
| malformed JSON | `400 MALFORMED_JSON`; an unexpected failure is `500 UNKNOWN_ERROR` with no internals |

Every failure answers `{code, message}`: the code is stable, the message is in the language of `Accept-Language`
(`en` or `es`; English when the client asks for neither). `statusLabel` follows the language too (`Pending`,
`Pendiente`); `total` is in US dollars in every language (`$17.50`): the currency is a fact of the order.

## Every piece, and why it is there

The plugin creates a piece only when its trigger is true. Every piece the skills describe appears here once, where
its trigger holds — and the pieces that are absent are absent for a reason, which is part of the example.

| Piece | Where | Why it exists |
|---|---|---|
| Entity + domain error | `customers/domain`, `orders/domain` | `Customer` and `Order` enforce their own invariants |
| Shared kernel | `shared/` | the base domain error (`DomainError`), common to both modules and free of their policy |
| Domain event | `orders/domain/events` — `OrderPlaced` | placed orders must reach an audit log, and the use case must not know how |
| Interactor, default flow | `customers/RegisterCustomer` | returns a response model; the controller maps it to HTTP |
| Input Port | `customers/application/ports/input` — `GetCustomer` | `orders` calls it: it is the module's public surface |
| Output Port + Presenter | `orders/PlaceOrder` | the answer formats money (`$17.50`) and a status label |
| Repository port + SQL gateway + persistence model | both modules | data access behind a port the use case owns |
| In-memory gateways | `infrastructure/gateways/in-memory` | the test composition root and the use case tests |
| Cross-module port + gateway | `orders` `CustomerLookup` → `customers` `GetCustomer` | the only legal crossing between modules |
| Event port + adapter | `orders` `OrderEvents` → audit log | `OrderPlaced` leaves the use case through a port |
| Migrations | `infrastructure/gateways/migrations` per module | each module owns its tables |
| Controllers, HTTP request DTO | `infrastructure/controllers` | delivery input → use case request |
| Platform | `platform/db`, `platform/web` | the connection, the migration runner, the web framework |
| Composition roots | production (SQLite) and test (in-memory) | the same HTTP scenarios run against both |
| Error reasons | `InvalidOrderError` / `InvalidCustomerError` carry a `reason` (`NO_LINES`, `INVALID_EMAIL`, …) | the outer layers map a code to a status and a text; the error's message is for logs |
| Translator + locale negotiation | `platform/i18n/` and `platform/web/` locale | finding a text, falling back to English, filling `{parameters}`; reading `Accept-Language` is an HTTP detail |
| Catalogs | beside the adapter that writes the text: `customers` controllers, `orders` presenter, `platform/web` | each module owns its texts; a test in `main/` proves every catalog has every locale |
| Configuration | `main/config` (Go: `bootstrap/settings.go`) | `DB_PATH` and `PORT` are read only by the entry point and validated once; a bad `PORT` stops the process at startup |

Absent on purpose:

- **Domain service** (`domain/services`): no rule of this domain spans two entities without belonging to one of them.
  Inventing one would teach the opposite of the rule.
- **Input Port for `RegisterCustomer` and `PlaceOrder`**: only a controller of their own module calls them.
- **Presenter for the customers use cases**: their answers need no formatting.

## Guards a happy-path test would miss

All three versions keep these tests:

- a second customer with an existing email is a `409`, and the first customer survives (an upsert by id, never
  `INSERT OR REPLACE`), against the SQL and the in-memory repository alike;
- a presenter is never shared between requests (a deterministic test on the factory);
- an unexpected failure never reaches the client with its internals;
- no `OrderPlaced` is published for an order that was not placed;
- a bad `PORT` (`abc`, `0`, `65536`, `1e3`) stops the process at startup, with an error that names the setting;
- every failure is answered in the language the client asked for (`es-AR` → Spanish), and in English when it asked
  for one the app does not speak.
