import pytest

from shop.platform.i18n.translator import create_translator
from shop.platform.web.locale import negotiate_locale

t = create_translator({"en": {"HELLO": "Hello {name}", "ONLY_EN": "Only in English"}, "es": {"HELLO": "Hola {name}"}}, "en")


def test_writes_the_key_for_the_locale_with_its_parameters():
    assert t("es", "HELLO", {"name": "Ada"}) == "Hola Ada"
    assert t("en", "HELLO", {"name": "Ada"}) == "Hello Ada"


def test_falls_back_to_the_default_locale_then_to_the_key_itself():
    assert t("es", "ONLY_EN") == "Only in English"
    assert t("fr", "HELLO", {"name": "Ada"}) == "Hello Ada"
    assert t("es", "MISSING") == "MISSING"


def test_leaves_a_parameter_it_was_not_given_as_it_is():
    assert t("en", "HELLO") == "Hello {name}"


@pytest.mark.parametrize(
    "header, locale",
    [
        (None, "en"),
        ("", "en"),
        ("es", "es"),
        ("es-AR", "es"),
        ("ES-ar", "es"),
        ("fr, es;q=0.5", "es"),
        ("en;q=0.4, es;q=0.8", "es"),
        ("es;q=0, en", "en"),
        ("*", "en"),
        ("fr-FR, de;q=0.8", "en"),
    ],
)
def test_negotiates_the_locale(header, locale):
    assert negotiate_locale(header, ["en", "es"]) == locale
