"""The texts the customers controllers send, by locale. Keys are the codes of domain and application failures.

The catalog belongs to the module: removing the module removes its texts.
"""
from typing import Mapping, Protocol

CUSTOMER_MESSAGES: Mapping[str, Mapping[str, str]] = {
    "en": {
        "INVALID_CUSTOMER.NAME_REQUIRED": "Customer name must not be empty",
        "INVALID_CUSTOMER.INVALID_EMAIL": "Customer email is not valid",
        "EMAIL_ALREADY_REGISTERED": "Email {email} is already registered",
        "CUSTOMER_NOT_FOUND": "Customer {customerId} not found",
    },
    "es": {
        "INVALID_CUSTOMER.NAME_REQUIRED": "El nombre del cliente no puede estar vacío",
        "INVALID_CUSTOMER.INVALID_EMAIL": "El email del cliente no es válido",
        "EMAIL_ALREADY_REGISTERED": "El email {email} ya está registrado",
        "CUSTOMER_NOT_FOUND": "No existe el cliente {customerId}",
    },
}


class Translate(Protocol):
    """What the controllers need to turn a key into text. main injects an implementation (platform/i18n)."""

    def __call__(self, locale: str, key: str, params: Mapping[str, str] = ...) -> str: ...
