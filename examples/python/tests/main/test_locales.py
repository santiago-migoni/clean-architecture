"""main promises that every locale the app speaks is spoken everywhere: no text falls back by accident."""
import pytest

from shop.main.locales import LOCALES
from shop.modules.customers.infrastructure.controllers.customer_messages import CUSTOMER_MESSAGES
from shop.modules.orders.infrastructure.presenters.place_order_messages import PLACE_ORDER_MESSAGES
from shop.platform.web.messages import WEB_MESSAGES


@pytest.mark.parametrize("catalog", [CUSTOMER_MESSAGES, PLACE_ORDER_MESSAGES, WEB_MESSAGES], ids=["customers", "orders", "platform/web"])
def test_a_catalog_has_exactly_the_app_locales_each_with_the_same_keys(catalog):
    assert sorted(catalog) == sorted(LOCALES)
    assert all(sorted(catalog[locale]) == sorted(catalog[LOCALES[0]]) for locale in LOCALES)
