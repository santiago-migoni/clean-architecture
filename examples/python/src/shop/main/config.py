"""CONFIGURATION, part of the composition root.

The environment is read once, at startup, by the entry point (__main__.py), which hands it to load_config. Every
value is validated here, so a wrong setting stops the process before it serves anything. The rest of the code never
sees the environment: main/ passes each piece only the values it uses.
"""
import re
from dataclasses import dataclass
from typing import Mapping


class ConfigError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(f"Invalid configuration: {message}")


@dataclass(frozen=True)
class AppConfig:
    db_path: str  # ":memory:" or a file path
    port: int


def load_config(env: Mapping[str, str]) -> AppConfig:
    db_path = env.get("DB_PATH", "").strip() or ":memory:"
    port_text = env.get("PORT", "").strip() or "8000"
    port = int(port_text) if re.fullmatch(r"\d+", port_text) else 0
    if not 1 <= port <= 65535:
        raise ConfigError(f'PORT must be a whole number from 1 to 65535, got "{port_text}"')
    return AppConfig(db_path=db_path, port=port)
