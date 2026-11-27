# Example (Python): orders + customers

The Python version of the plugin's reference example: the same application, pieces and tests as the
[TypeScript](../typescript) and [Go](../go) versions. [The overview](../README.md) lists every piece and why it is there.

FastAPI · SQLite (`sqlite3`, standard library) · pytest · import-linter. Requires Python 3.11+.

```bash
cd examples/python
python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
PYTHONPATH=src lint-imports     # both architecture rules as import-linter contracts
pytest                          # unit, integration and e2e tests
python -m shop.main             # http://127.0.0.1:8000  (PORT and DB_PATH are optional)
```

## Structure

```
src/shop/
├── modules/
│   ├── customers/
│   │   ├── domain/            customer.py, errors.py
│   │   ├── application/
│   │   │   ├── ports/input/   get_customer.py        ← public surface: orders calls it
│   │   │   ├── ports/output/  customer_repository.py
│   │   │   ├── interactors/   register_customer.py, get_customer.py
│   │   │   └── errors.py
│   │   └── infrastructure/
│   │       ├── controllers/   register_customer_controller.py, get_customer_controller.py, register_customer_http_request.py
│   │       └── gateways/      sql_customer_repository.py, customer_persistence_model.py, in_memory/, migrations/
│   └── orders/
│       ├── domain/            order.py, errors.py, events/order_placed.py
│       ├── application/
│       │   ├── ports/published/ order_placed_v1.py     ← public surface: loyalty subscribes to it
│       │   ├── ports/output/  order_repository.py, customer_lookup.py, place_order_output.py, order_events.py
│       │   ├── interactors/   place_order.py
│       │   └── errors.py
│       └── infrastructure/
│           ├── controllers/   place_order_controller.py, place_order_http_request.py
│           ├── presenters/    place_order_presenter.py, place_order_view_model.py
│           └── gateways/      sql_order_repository.py, order_persistence_model.py, customer_lookup_gateway.py,
│                              published_order_events.py, in_memory/, migrations/
│   └── loyalty/
│       ├── domain/            points_award.py, errors.py
│       ├── application/       interactors/{award_points,get_points}.py · ports/output/award_repository.py
│       └── infrastructure/
│           ├── subscribers/   order_placed_subscriber.py   ← imports orders' published contract
│           ├── controllers/   get_points_controller.py
│           └── gateways/      sql_award_repository.py, in_memory/, migrations/
├── shared/                    domain_error.py   ← base of every module's domain error
├── platform/                  db/{connection,migrate}.py · events/in_process_bus.py · i18n/translator.py · web/{app,locale,messages}.py (FastAPI, locale, last-resort handlers)
└── main/                      app.py (create_app) · __main__.py (serve) · config.py (load_config) · locales.py · compose/{customers,orders,loyalty}.py · testing.py
tests/<module>/unit/ (mirrors the module) · tests/<module>/integration/ · tests/shared/ · tests/e2e/
```

## Python-specific decisions

- **Controllers are framework-free**: they take the parsed body (or a path value) and return `(status, body)`;
  the FastAPI routes in `platform/web/app.py` call them. Controllers are unit-tested without an HTTP stack.
- **Ports are `typing.Protocol`s**: gateways satisfy them structurally and never import them.
- **One SQLite connection** (`check_same_thread=False`), shared by async handlers that run one at a time on the
  server's event loop.
- **Malformed JSON is a 400**, raised by the route before any controller runs; any other unexpected failure is a
  logged 500 with no internals.
