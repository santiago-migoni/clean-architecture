"""The answers platform/web writes itself (no module is involved in them)."""
from shop.platform.i18n.translator import Catalog

WEB_MESSAGES: Catalog = {
    "en": {"MALFORMED_JSON": "Malformed JSON", "UNKNOWN_ERROR": "Unexpected error"},
    "es": {"MALFORMED_JSON": "JSON mal formado", "UNKNOWN_ERROR": "Error inesperado"},
}
