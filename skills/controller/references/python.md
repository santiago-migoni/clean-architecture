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
from .place_order_messages import Translate


def _int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return -1  # coerced, not validated: the entity rejects it with InvalidOrderError


class PlaceOrderController:
    def __init__(self, place_order: PlaceOrderInteractor, t: Translate) -> None:
        self._place_order = place_order
        self._t = t

    def handle(self, body: dict[str, Any], locale: str) -> tuple[int, dict[str, Any]]:  # locale: from platform/web
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
        # A status, a stable code and a text in the request's language; by type and reason, never by the message.
        except InvalidOrderError as error:
            return 400, {"code": "INVALID_ORDER", "message": self._t(locale, f"INVALID_ORDER.{error.reason}")}
        except CustomerNotFoundError as error:
            message = self._t(locale, "CUSTOMER_NOT_FOUND", {"customerId": error.customer_id})
            return 404, {"code": "CUSTOMER_NOT_FOUND", "message": message}
        # Anything else propagates: the framework's last-resort handler answers 500 without internals.
        return 201, {"orderId": response.order_id, "status": response.status, "totalCents": response.total_cents}
```

The texts are the module's own, beside the adapter that writes them. The translator is injected by `main/`; the
implementation lives in `platform/i18n/`, which a module never imports:

```python
# src/shop/modules/orders/infrastructure/controllers/place_order_messages.py
from typing import Mapping, Protocol

PLACE_ORDER_MESSAGES: Mapping[str, Mapping[str, str]] = {
    "en": {
        "CUSTOMER_NOT_FOUND": "Customer {customerId} not found",
        "INVALID_ORDER.NO_LINES": "Order must have at least one line",
    },
    "es": {
        "CUSTOMER_NOT_FOUND": "No existe el cliente {customerId}",
        "INVALID_ORDER.NO_LINES": "El pedido debe tener al menos una línea",
    },
}


class Translate(Protocol):
    def __call__(self, locale: str, key: str, params: Mapping[str, str] = ...) -> str: ...
```

## The framework route (platform/web)

```python
# src/shop/platform/web/app.py — framework wiring only; the controller comes ready-made from main/
import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from shop.modules.orders.infrastructure.controllers.place_order_controller import PlaceOrderController
from shop.platform.i18n.translator import create_translator
from shop.platform.web.locale import negotiate_locale
from shop.platform.web.messages import WEB_MESSAGES


def build_app(place_order: PlaceOrderController, locales: tuple[str, ...]) -> FastAPI:
    app = FastAPI()
    t = create_translator(WEB_MESSAGES, locales[0])

    def locale_of(request: Request) -> str:  # Accept-Language is an HTTP detail: negotiated here, never in a module
        return negotiate_locale(request.headers.get("accept-language"), locales)

    @app.post("/orders")
    async def post_order(request: Request) -> JSONResponse:
        status, body = place_order.handle(await request.json(), locale_of(request))
        return JSONResponse(body, status_code=status)

    @app.exception_handler(Exception)
    async def unexpected(request: Request, error: Exception) -> JSONResponse:
        logging.exception("Unhandled error", exc_info=error)  # log it, never send it
        return JSONResponse({"code": "UNKNOWN_ERROR", "message": t(locale_of(request), "UNKNOWN_ERROR")}, status_code=500)

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
from shop.modules.orders.infrastructure.controllers.place_order_messages import PLACE_ORDER_MESSAGES
from shop.platform.i18n.translator import create_translator

t = create_translator(PLACE_ORDER_MESSAGES, "en")


class RaisingUseCase:
    def __init__(self, error: Exception) -> None:
        self.error = error

    def execute(self, request):
        raise self.error


def test_maps_an_unknown_customer_to_404_with_its_code_and_a_text_in_the_request_language():
    controller = PlaceOrderController(RaisingUseCase(CustomerNotFoundError("c-9")), t)
    assert controller.handle({"customerId": "c-9", "items": []}, "es") == (
        404,
        {"code": "CUSTOMER_NOT_FOUND", "message": "No existe el cliente c-9"},
    )


def test_lets_an_unexpected_failure_propagate():
    with pytest.raises(RuntimeError):
        PlaceOrderController(RaisingUseCase(RuntimeError("database is locked")), t).handle({}, "en")
```
