"""Enterprise business rules of the orders module. Customers are referenced by id only."""
from dataclasses import dataclass


class InvalidOrderError(ValueError):
    pass


@dataclass(frozen=True)
class Order:
    id: str
    customer_id: str
    quantity: int

    def __post_init__(self) -> None:
        if self.quantity <= 0:
            raise InvalidOrderError("quantity must be positive")
