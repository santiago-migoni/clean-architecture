class CustomerNotFoundError(LookupError):
    """An APPLICATION failure: the use case needs a customer that does not exist."""

    def __init__(self, customer_id: str) -> None:
        super().__init__(f"Customer {customer_id} not found")
        self.customer_id = customer_id
