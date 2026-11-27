"""Implements OrderEvents by writing one JSON line per event. The sink is injected by main."""
import json
from dataclasses import asdict
from typing import Callable

from ...domain.events.order_placed import OrderPlaced


class AuditLogOrderEvents:
    def __init__(self, write_line: Callable[[str], None]) -> None:
        self._write_line = write_line

    def publish(self, event: OrderPlaced) -> None:
        self._write_line(json.dumps(asdict(event)))
