"""Which of the supported locales a request wants (Accept-Language). An HTTP detail."""
import re
from typing import Optional, Sequence

_Q = re.compile(r"^\s*q=([\d.]+)\s*$")


def negotiate_locale(accept_language: Optional[str], supported: Sequence[str]) -> str:
    """The first supported language in the client's order of preference (q weights, then position), matched by its
    primary subtag ("es-AR" -> "es"). `supported[0]` is the default: no header, "*", or nothing supported."""
    wanted = []
    for index, part in enumerate((accept_language or "").split(",")):
        tag, *params = part.strip().split(";")
        q_values = [m.group(1) for m in (_Q.match(p) for p in params) if m]
        try:
            q = float(q_values[0]) if q_values else 1.0
        except ValueError:
            q = 0.0
        language = tag.strip().split("-")[0].lower()
        if language and q > 0:
            wanted.append((-q, index, language))
    for _, _, language in sorted(wanted):
        if language in supported:
            return language
    return supported[0]
