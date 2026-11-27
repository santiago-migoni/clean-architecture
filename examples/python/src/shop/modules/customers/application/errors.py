class EmailAlreadyRegisteredError(Exception):
    """Another customer already uses this email. Part of CustomerRepository.save's contract."""

    def __init__(self, email: str) -> None:
        super().__init__(f"Email {email} is already registered")
        self.email = email
