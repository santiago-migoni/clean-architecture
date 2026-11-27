# Presenter — Python

The complete, tested version of this code is [`examples/python`](../../../examples/python): the same application in every language.

Files: `src/<package>/modules/<module>/infrastructure/presenters/<name>_presenter.py` with `<name>_view_model.py` beside it; the humble route in `src/<package>/platform/web/`. The presenter satisfies the Output Port `Protocol` structurally.

## View model

```python
# src/shop/modules/orders/infrastructure/presenters/place_order_view_model.py
# Plain data — no logic. Formatted for the view / HTTP response.
from dataclasses import dataclass
from typing import Literal

PlaceOrderErrorCode = Literal["CUSTOMER_NOT_FOUND", "INVALID_ORDER", "UNKNOWN_ERROR"]


@dataclass(frozen=True)
class PlaceOrderViewModel:
    order_id: str
    status_label: str  # "Pending" instead of "PENDING"
    total: str  # "$25.00" instead of 2500 (cents)


@dataclass(frozen=True)
class PlaceOrderErrorViewModel:
    code: PlaceOrderErrorCode
    message: str
```

## Presenter — the testable half

The use case returns codes (a status, a failure reason); the presenter writes them for the request's locale. The
texts are the module's own, in a catalog beside the presenter (`place_order_messages.py`, a mapping locale → key →
text, and the `Translate` protocol); the translator is injected by `main` (its implementation lives in
`platform/i18n/`, which a module never imports).

```python
# src/shop/modules/orders/infrastructure/presenters/place_order_presenter.py
# May import this module's application/ and domain/ and shop.shared; never platform/, main/, web libraries or other modules.
from typing import Optional

from ...application.errors import CustomerNotFoundError
from ...application.interactors.place_order import PlaceOrderResponse
from ...domain.errors import InvalidOrderError
from .place_order_messages import Translate
from .place_order_view_model import PlaceOrderErrorCode, PlaceOrderErrorViewModel, PlaceOrderViewModel


class PlaceOrderPresenter:
    def __init__(self, t: Translate, locale: str) -> None:  # one presenter per request: the locale is the request's
        self._t = t
        self._locale = locale
        self.view_model: Optional[PlaceOrderViewModel] = None
        self.error_view_model: Optional[PlaceOrderErrorViewModel] = None

    def present(self, response: PlaceOrderResponse) -> None:
        key = f"STATUS.{response.status}"
        label = self._t(self._locale, key)
        self.view_model = PlaceOrderViewModel(
            order_id=response.order_id,
            status_label=response.status if label == key else label,  # an unknown status stays readable
            total=f"${response.total_cents / 100:,.2f}",  # dollars whatever the language: a fact of the order
        )

    def present_error(self, error: Exception) -> None:
        # By type and reason, never by message text. Never leak the message of an unexpected failure.
        if isinstance(error, CustomerNotFoundError):
            self._fail("CUSTOMER_NOT_FOUND", self._t(self._locale, "CUSTOMER_NOT_FOUND", {"customerId": error.customer_id}))
        elif isinstance(error, InvalidOrderError):
            self._fail("INVALID_ORDER", self._t(self._locale, f"INVALID_ORDER.{error.reason}"))
        else:
            self._fail("UNKNOWN_ERROR", self._t(self._locale, "UNKNOWN_ERROR"))

    @property
    def has_error(self) -> bool:
        return self.error_view_model is not None

    def _fail(self, code: PlaceOrderErrorCode, message: str) -> None:
        self.error_view_model = PlaceOrderErrorViewModel(code, message)
```

## The view — the humble half, in platform/web

```python
# src/shop/platform/web/place_order_route.py
# Thin: reads what the presenter prepared and sends it. main builds a NEW presenter + controller per request,
# in the request's locale (negotiated from Accept-Language by locale_of, in platform/web).
from dataclasses import asdict
from typing import Callable

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

STATUS_BY_CODE = {"CUSTOMER_NOT_FOUND": 404, "INVALID_ORDER": 400, "UNKNOWN_ERROR": 500}


def add_place_order_route(app: FastAPI, make: Callable, locale_of: Callable[[Request], str]) -> None:
    @app.post("/orders")
    async def post_order(request: Request) -> JSONResponse:
        presenter, controller = make(locale_of(request))
        controller.handle(await request.json())
        if presenter.has_error:
            error = presenter.error_view_model
            return JSONResponse(asdict(error), status_code=STATUS_BY_CODE[error.code])
        return JSONResponse(asdict(presenter.view_model), status_code=201)
```

## Test — no HTTP stack

```python
# tests/orders/unit/infrastructure/presenters/test_place_order_presenter.py
from shop.modules.orders.application.errors import CustomerNotFoundError
from shop.modules.orders.application.interactors.place_order import PlaceOrderResponse
from shop.modules.orders.infrastructure.presenters.place_order_messages import PLACE_ORDER_MESSAGES
from shop.modules.orders.infrastructure.presenters.place_order_presenter import PlaceOrderPresenter
from shop.platform.i18n.translator import create_translator


def presenter(locale="en"):
    return PlaceOrderPresenter(create_translator(PLACE_ORDER_MESSAGES, "en"), locale)


def test_formats_the_response_model_in_the_request_language():
    p = presenter("es")
    p.present(PlaceOrderResponse("o-1", "PENDING", 123456))
    assert (p.view_model.status_label, p.view_model.total) == ("Pendiente", "$1,234.56")


def test_maps_a_typed_error_to_its_code_and_a_text_for_the_locale():
    p = presenter("en")
    p.present_error(CustomerNotFoundError("c-9"))
    assert (p.error_view_model.code, p.error_view_model.message) == ("CUSTOMER_NOT_FOUND", "Customer c-9 not found")


def test_never_leaks_an_unexpected_failure():
    p = presenter("en")
    p.present_error(RuntimeError("no such table: orders"))
    assert p.error_view_model.message == "Unexpected error"
```
