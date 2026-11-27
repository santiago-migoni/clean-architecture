"""Builds the FastAPI app: routes, and the last-resort error handlers. It receives ready-made handlers from main."""
import json
import logging
from dataclasses import asdict, dataclass
from typing import Any, Callable, Protocol

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class JsonController(Protocol):
    def handle(self, body: Any) -> tuple[int, dict[str, Any]]: ...


class PathController(Protocol):
    def handle(self, value: str) -> tuple[int, dict[str, Any]]: ...


@dataclass
class RouteHandlers:
    register_customer: JsonController
    get_customer: PathController
    make_place_order: Callable[[], tuple[Any, Any]]  # () -> (presenter, controller): a NEW pair per request


# Delivery detail: which HTTP status each presenter error code gets.
STATUS_BY_CODE = {"CUSTOMER_NOT_FOUND": 404, "INVALID_ORDER": 400, "UNKNOWN_ERROR": 500}


async def _json(request: Request) -> Any:
    try:
        return json.loads(await request.body() or b"null")
    except ValueError as error:
        raise MalformedJson() from error


class MalformedJson(Exception):
    pass


def build_app(handlers: RouteHandlers) -> FastAPI:
    app = FastAPI()

    @app.post("/customers")
    async def register_customer(request: Request) -> JSONResponse:
        body = await _json(request)
        status, payload = handlers.register_customer.handle(body if isinstance(body, dict) else {})
        return JSONResponse(payload, status_code=status)

    @app.get("/customers/{customer_id}")
    async def get_customer(customer_id: str) -> JSONResponse:
        status, payload = handlers.get_customer.handle(customer_id)
        return JSONResponse(payload, status_code=status)

    @app.post("/orders")
    async def place_order(request: Request) -> JSONResponse:
        body = await _json(request)
        presenter, controller = handlers.make_place_order()  # the HUMBLE view: read the presenter, send
        controller.handle(body if isinstance(body, dict) else {})
        if presenter.has_error:
            error = presenter.error_view_model
            return JSONResponse(asdict(error), status_code=STATUS_BY_CODE[error.code])
        return JSONResponse(asdict(presenter.view_model), status_code=201)

    @app.exception_handler(MalformedJson)
    async def malformed(_: Request, __: Exception) -> JSONResponse:
        return JSONResponse({"message": "Malformed JSON"}, status_code=400)

    @app.exception_handler(Exception)
    async def unexpected(_: Request, error: Exception) -> JSONResponse:
        logging.getLogger("shop").exception("Unhandled error", exc_info=error)  # log it, never send it
        return JSONResponse({"message": "Unexpected error"}, status_code=500)

    return app
