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

```python
# src/shop/modules/orders/infrastructure/presenters/place_order_presenter.py
# May import this module's application/ and domain/ and shop.shared; never platform/, main/, web libraries or other modules.
from typing import Optional

from ...application.errors import CustomerNotFoundError
from ...application.interactors.place_order import PlaceOrderResponse
from ...domain.errors import InvalidOrderError
from .place_order_view_model import PlaceOrderErrorCode, PlaceOrderErrorViewModel, PlaceOrderViewModel

STATUS_LABELS = {"PENDING": "Pending", "CANCELLED": "Cancelled"}


class PlaceOrderPresenter:
    def __init__(self) -> None:
        self.view_model: Optional[PlaceOrderViewModel] = None
        self.error_view_model: Optional[PlaceOrderErrorViewModel] = None

    def present(self, response: PlaceOrderResponse) -> None:
        self.view_model = PlaceOrderViewModel(
            order_id=response.order_id,
            status_label=STATUS_LABELS.get(response.status, response.status),
            total=f"${response.total_cents / 100:,.2f}",
        )

    def present_error(self, error: Exception) -> None:
        code = self._code(error)
        # Never leak the message of an unexpected failure.
        self.error_view_model = PlaceOrderErrorViewModel(code, "Unexpected error" if code == "UNKNOWN_ERROR" else str(error))

    @property
    def has_error(self) -> bool:
        return self.error_view_model is not None

    @staticmethod
    def _code(error: Exception) -> PlaceOrderErrorCode:
        if isinstance(error, CustomerNotFoundError):
            return "CUSTOMER_NOT_FOUND"
        if isinstance(error, InvalidOrderError):
            return "INVALID_ORDER"
        return "UNKNOWN_ERROR"
```

## The view — the humble half, in platform/web

```python
# src/shop/platform/web/place_order_route.py
# Thin: reads what the presenter prepared and sends it. main builds a NEW presenter + controller per request.
from dataclasses import asdict
from typing import Callable

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

STATUS_BY_CODE = {"CUSTOMER_NOT_FOUND": 404, "INVALID_ORDER": 400, "UNKNOWN_ERROR": 500}


def add_place_order_route(app: FastAPI, make: Callable) -> None:
    @app.post("/orders")
    async def post_order(request: Request) -> JSONResponse:
        presenter, controller = make()
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
from shop.modules.orders.infrastructure.presenters.place_order_presenter import PlaceOrderPresenter


def test_formats_the_response_model():
    presenter = PlaceOrderPresenter()
    presenter.present(PlaceOrderResponse("o-1", "PENDING", 123456))
    assert (presenter.view_model.status_label, presenter.view_model.total) == ("Pending", "$1,234.56")


def test_maps_a_typed_error_to_its_code():
    presenter = PlaceOrderPresenter()
    presenter.present_error(CustomerNotFoundError("c-9"))
    assert presenter.error_view_model.code == "CUSTOMER_NOT_FOUND"


def test_never_leaks_an_unexpected_failure():
    presenter = PlaceOrderPresenter()
    presenter.present_error(RuntimeError("no such table: orders"))
    assert presenter.error_view_model.message == "Unexpected error"
```
