"""Builds the FastAPI app: routes, and the last-resort error handlers. It receives ready-made handlers from main,
and the locales the app speaks."""
import json
import logging
from dataclasses import asdict, dataclass
from typing import Any, Callable, Protocol, Sequence

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from shop.platform.i18n.translator import create_translator
from shop.platform.web.locale import negotiate_locale
from shop.platform.web.messages import WEB_MESSAGES


# Every controller gets the locale negotiated here: reading Accept-Language is an HTTP detail.
class JsonController(Protocol):
    def handle(self, body: Any, locale: str) -> tuple[int, dict[str, Any]]: ...


class PathController(Protocol):
    def handle(self, value: str, locale: str) -> tuple[int, dict[str, Any]]: ...


@dataclass
class RouteHandlers:
    register_customer: JsonController
    get_customer: PathController
    make_place_order: Callable[[str], tuple[Any, Any]]  # (locale) -> (presenter, controller): a NEW pair per request


# Delivery detail: which HTTP status each presenter error code gets.
STATUS_BY_CODE = {"CUSTOMER_NOT_FOUND": 404, "INVALID_ORDER": 400, "UNKNOWN_ERROR": 500}


async def _json(request: Request) -> Any:
    try:
        return json.loads(await request.body() or b"null")
    except ValueError as error:
        raise MalformedJson() from error


class MalformedJson(Exception):
    pass


def build_app(handlers: RouteHandlers, locales: Sequence[str]) -> FastAPI:
    """`locales[0]` is the default: the answer when the client asks for nothing the app speaks."""
    app = FastAPI()
    t = create_translator(WEB_MESSAGES, locales[0])

    def locale_of(request: Request) -> str:
        return negotiate_locale(request.headers.get("accept-language"), locales)

    @app.post("/customers")
    async def register_customer(request: Request) -> JSONResponse:
        body = await _json(request)
        status, payload = handlers.register_customer.handle(body if isinstance(body, dict) else {}, locale_of(request))
        return JSONResponse(payload, status_code=status)

    @app.get("/customers/{customer_id}")
    async def get_customer(customer_id: str, request: Request) -> JSONResponse:
        status, payload = handlers.get_customer.handle(customer_id, locale_of(request))
        return JSONResponse(payload, status_code=status)

    @app.post("/orders")
    async def place_order(request: Request) -> JSONResponse:
        body = await _json(request)
        presenter, controller = handlers.make_place_order(locale_of(request))  # the HUMBLE view: read the presenter, send
        controller.handle(body if isinstance(body, dict) else {})
        if presenter.has_error:
            error = presenter.error_view_model
            return JSONResponse(asdict(error), status_code=STATUS_BY_CODE[error.code])
        return JSONResponse(asdict(presenter.view_model), status_code=201)

    @app.exception_handler(MalformedJson)
    async def malformed(request: Request, __: Exception) -> JSONResponse:
        return JSONResponse({"code": "MALFORMED_JSON", "message": t(locale_of(request), "MALFORMED_JSON")}, status_code=400)

    @app.exception_handler(Exception)
    async def unexpected(request: Request, error: Exception) -> JSONResponse:
        logging.getLogger("shop").exception("Unhandled error", exc_info=error)  # log it, never send it
        return JSONResponse({"code": "UNKNOWN_ERROR", "message": t(locale_of(request), "UNKNOWN_ERROR")}, status_code=500)

    return app
