"""The texts the PlaceOrder presenter writes, by locale. Keys are status and failure codes from the inner layers.

The catalog belongs to the module: removing the module removes its texts.
"""
from typing import Mapping, Protocol

PLACE_ORDER_MESSAGES: Mapping[str, Mapping[str, str]] = {
    "en": {
        "STATUS.PENDING": "Pending",
        "STATUS.CANCELLED": "Cancelled",
        "CUSTOMER_NOT_FOUND": "Customer {customerId} not found",
        "INVALID_ORDER.CUSTOMER_REQUIRED": "Order must reference a customer",
        "INVALID_ORDER.NO_LINES": "Order must have at least one line",
        "INVALID_ORDER.PRODUCT_REQUIRED": "Line product id must not be empty",
        "INVALID_ORDER.INVALID_QUANTITY": "Line quantity must be a positive integer",
        "INVALID_ORDER.INVALID_UNIT_PRICE": "Unit price must be a non-negative integer (cents)",
        "UNKNOWN_ERROR": "Unexpected error",
    },
    "es": {
        "STATUS.PENDING": "Pendiente",
        "STATUS.CANCELLED": "Cancelado",
        "CUSTOMER_NOT_FOUND": "No existe el cliente {customerId}",
        "INVALID_ORDER.CUSTOMER_REQUIRED": "El pedido debe indicar un cliente",
        "INVALID_ORDER.NO_LINES": "El pedido debe tener al menos una línea",
        "INVALID_ORDER.PRODUCT_REQUIRED": "Cada línea debe indicar un producto",
        "INVALID_ORDER.INVALID_QUANTITY": "La cantidad de cada línea debe ser un entero positivo",
        "INVALID_ORDER.INVALID_UNIT_PRICE": "El precio unitario debe ser un entero no negativo (en centavos)",
        "UNKNOWN_ERROR": "Error inesperado",
    },
}


class Translate(Protocol):
    """What the presenter needs to turn a key into text. main injects an implementation (platform/i18n)."""

    def __call__(self, locale: str, key: str, params: Mapping[str, str] = ...) -> str: ...
