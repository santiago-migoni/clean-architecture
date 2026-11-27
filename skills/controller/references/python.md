# Controller — Python

The complete, tested version of this code is [`examples/python`](../../../examples/python): the same application in every language.

Files: `src/<package>/modules/<module>/infrastructure/controllers/<name>_controller.py`. The controller receives plain delivery data (a parsed JSON body, CLI arguments) and returns a status and a body, so it is testable without the web framework; the framework route that calls it lives in `src/<package>/platform/web/`. The examples use FastAPI for that route; any framework works the same way.

## Default style — the controller maps the response model to an HTTP answer

```python
# src/shop/modules/orders/infrastructure/controllers/place_order_controller.py
# May import this module's application/ and domain/ (errors) and shop.shared; never platform/, main/ or another module.
from typing import Any

from ...application.errors import CustomerNotFoundError
from ...application.interactors.place_order import PlaceOrderInteractor, PlaceOrderLine, PlaceOrderRequest
from ...domain.errors import InvalidOrderError


def _int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return -1  # coerced, not validated: the entity rejects it with InvalidOrderError


class PlaceOrderController:
    def __init__(self, place_order: PlaceOrderInteractor) -> None:
        self._place_order = place_order

    def handle(self, body: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        # HTTP vocabulary (items) → use case vocabulary (lines)
        items = body.get("items") if isinstance(body.get("items"), list) else []
        request = PlaceOrderRequest(
            customer_id=str(body.get("customerId") or ""),
            lines=tuple(
                PlaceOrderLine(str(i.get("productId") or ""), _int(i.get("quantity")), _int(i.get("unitPriceCents")))
                for i in items
                if isinstance(i, dict)
            ),
        )
        try:
            response = self._place_order.execute(request)
        except InvalidOrderError as error:
            return 400, {"message": str(error)}
        except CustomerNotFoundError as error:
            return 404, {"message": str(error)}
        # Anything else propagates: the framework's last-resort handler answers 500 without internals.
        return 201, {"orderId": response.order_id, "status": response.status, "totalCents": response.total_cents}
```

## The framework route (platform/web)

```python
# src/shop/platform/web/app.py — framework wiring only; the controller comes ready-made from main/
import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from shop.modules.orders.infrastructure.controllers.place_order_controller import PlaceOrderController


def build_app(place_order: PlaceOrderController) -> FastAPI:
    app = FastAPI()

    @app.post("/orders")
    async def post_order(request: Request) -> JSONResponse:
        status, body = place_order.handle(await request.json())
        return JSONResponse(body, status_code=status)

    @app.exception_handler(Exception)
    async def unexpected(_: Request, error: Exception) -> JSONResponse:
        logging.exception("Unhandled error", exc_info=error)  # log it, never send it
        return JSONResponse({"message": "Unexpected error"}, status_code=500)

    return app
```

`platform/` may import the module's controllers; the controller never imports `platform/`.

## With an Output Port

The controller only builds the request and calls the use case; it returns nothing. The route reads the presenter afterwards (see the `presenter` skill).

## Test — the use case is replaced, no server is started

```python
# tests/orders/unit/infrastructure/controllers/test_place_order_controller.py
import pytest

from shop.modules.orders.application.errors import CustomerNotFoundError
from shop.modules.orders.infrastructure.controllers.place_order_controller import PlaceOrderController


class RaisingUseCase:
    def __init__(self, error: Exception) -> None:
        self.error = error

    def execute(self, request):
        raise self.error


def test_maps_an_unknown_customer_to_404():
    status, body = PlaceOrderController(RaisingUseCase(CustomerNotFoundError("c-9"))).handle({"customerId": "c-9", "items": []})
    assert status == 404


def test_lets_an_unexpected_failure_propagate():
    with pytest.raises(RuntimeError):
        PlaceOrderController(RaisingUseCase(RuntimeError("database is locked"))).handle({})
```
