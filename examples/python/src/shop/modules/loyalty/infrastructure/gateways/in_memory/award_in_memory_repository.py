"""Non-production gateway, same contract as the SQL one (one award per order)."""
from ....domain.points_award import PointsAward


class AwardInMemoryRepository:
    def __init__(self) -> None:
        self._by_order: dict[str, PointsAward] = {}

    def add(self, award: PointsAward) -> bool:
        if award.order_id in self._by_order:
            return False
        self._by_order[award.order_id] = award
        return True

    def points_of(self, customer_id: str) -> int:
        return sum(a.points for a in self._by_order.values() if a.customer_id == customer_id)
