"""Ena globalna verzija aplikacije: 0.5.<število komitov>."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

# Ob releaseu: VERSION = 0.5.<git rev-list --count HEAD> (po komitu).
VERSION_MAJOR_MINOR = "0.5"


@lru_cache(maxsize=1)
def get_app_version() -> str:
    env = (os.environ.get("APP_VERSION") or "").strip()
    if env:
        return env

    here = Path(__file__).resolve()
    candidates = [
        here.parents[1] / "VERSION",  # backend/VERSION (Docker /app/VERSION)
        here.parents[2] / "VERSION",  # repo root (dev volume)
    ]
    for path in candidates:
        try:
            text = path.read_text(encoding="utf-8").strip()
        except OSError:
            continue
        if text:
            return text.splitlines()[0].strip()

    return f"{VERSION_MAJOR_MINOR}.0"
