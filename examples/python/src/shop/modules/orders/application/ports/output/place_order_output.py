"""Output Port: implemented by the Presenter, called by the interactor. Plain data only."""
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class PlaceOrderResponse:
    order_id: str
    status: str
    total_cents: int


class PlaceOrderOutput(Protocol):
    def present(self, response: PlaceOrderResponse) -> None: ...

    def present_error(self, error: Exception) -> None: ...
