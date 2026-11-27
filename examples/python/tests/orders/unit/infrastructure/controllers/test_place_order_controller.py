from shop.modules.orders.infrastructure.controllers.place_order_controller import PlaceOrderController


class Capture:
    def execute(self, request):
        self.request = request


def test_translates_http_items_into_use_case_lines_and_coerces_bad_numbers():
    use_case = Capture()
    PlaceOrderController(use_case).handle(
        {"customerId": "c-1", "items": [{"productId": "p1", "quantity": 2, "unitPriceCents": 250}, {"quantity": "two"}]}
    )
    first, second = use_case.request.lines
    assert (use_case.request.customer_id, first.product_id, first.quantity, first.unit_price_cents) == ("c-1", "p1", 2, 250)
    assert (second.product_id, second.quantity) == ("", -1)  # the entity rejects it, not the controller


def test_a_body_without_items_becomes_an_order_without_lines():
    use_case = Capture()
    PlaceOrderController(use_case).handle({"customerId": "c-1"})
    assert use_case.request.lines == ()
