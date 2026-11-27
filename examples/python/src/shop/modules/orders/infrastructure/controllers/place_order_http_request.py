"""The HTTP body exactly as it arrives. The use case request uses its own vocabulary (lines, not items)."""
from typing import TypedDict


class PlaceOrderHttpItem(TypedDict, total=False):
    productId: str
    quantity: int
    unitPriceCents: int


class PlaceOrderHttpRequest(TypedDict, total=False):
    customerId: str
    items: list[PlaceOrderHttpItem]
