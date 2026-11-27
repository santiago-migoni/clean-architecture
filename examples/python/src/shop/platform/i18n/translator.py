"""Turns a message key into text for a locale. A driver, like the database: a project that adopts an i18n library
(Babel, gettext) replaces this file, and no module changes. Each module keeps its own catalog beside the adapter that
writes the text; main builds one translator per catalog."""
import re
from typing import Callable, Mapping

Catalog = Mapping[str, Mapping[str, str]]  # locale -> key -> text; parameters are written as {name}
Translate = Callable[..., str]  # (locale, key, params={}) -> text

_PARAM = re.compile(r"\{(\w+)\}")


def create_translator(catalog: Catalog, fallback_locale: str) -> Translate:
    """A missing locale or key falls back to `fallback_locale`, then to the key itself (never to an empty text)."""

    def translate(locale: str, key: str, params: Mapping[str, str] = {}) -> str:  # noqa: B006 — read only
        text = catalog.get(locale, {}).get(key) or catalog.get(fallback_locale, {}).get(key) or key
        return _PARAM.sub(lambda m: params.get(m.group(1), m.group(0)), text)

    return translate
