"""Default style: maps the response model to an HTTP answer itself.

It never fails for a known reason (an unknown customer has 0 points), so it has no texts to translate.
"""
from typing import Any

from ...application.interactors.get_points import GetPointsInteractor


class GetPointsController:
    def __init__(self, use_case: GetPointsInteractor) -> None:
        self._use_case = use_case

    def handle(self, customer_id: str, locale: str) -> tuple[int, dict[str, Any]]:  # noqa: ARG002 — nothing to translate
        response = self._use_case.execute(customer_id)
        return 200, {"customerId": response.customer_id, "points": response.points}
