"""Admin simulacija tekem: boti (+ začasni host), enako kot prava igra — rezultati na lestvico.

Vhodna točka: ``simulate_match``. Lobby → ``simulate_lobby``, solo → ``simulate_solo``.
"""

from __future__ import annotations

from game.engine import GameError
from game.modes import LOBBY_MODES, MODE_HITRARUNDA, PLAYABLE_MODES
from game.seed_content import ensure_bots
from game.simulate_lobby import simulate_lobby
from game.simulate_solo import simulate_solo


def simulate_match(staff_user, raw: dict) -> dict:
    """Zaženi tekmo z boti in vrni povzetek + log + rezultate (za lestvico)."""
    del staff_user  # rezervirano za audit / rate-limit
    ensure_bots()
    raw = raw if isinstance(raw, dict) else {}
    log: list[str] = []

    mode = str(raw.get("mode") or "multiplayer").strip()
    if mode == "millionaire":
        mode = MODE_HITRARUNDA
    if mode not in PLAYABLE_MODES:
        raise GameError("Neznan način igre.")

    categories = list(raw.get("categories") or [])
    bots_on_board = bool(raw.get("count_for_leaderboard", True))
    include_host = bool(raw.get("include_host_on_leaderboard", False))
    max_rounds = max(5, min(int(raw.get("max_rounds") or 100), 200))

    raw_keys = raw.get("bot_keys")
    if isinstance(raw_keys, list) and raw_keys:
        wanted_keys = [str(k).strip() for k in raw_keys if str(k).strip()]
    else:
        wanted_keys = []

    if mode in LOBBY_MODES:
        return simulate_lobby(
            mode=mode,
            raw=raw,
            categories=categories,
            wanted_keys=wanted_keys,
            bots_on_board=bots_on_board,
            include_host=include_host,
            max_rounds=max_rounds,
            log=log,
        )
    return simulate_solo(
        mode=mode,
        raw=raw,
        categories=categories,
        wanted_keys=wanted_keys,
        bots_on_board=bots_on_board,
        max_rounds=max_rounds,
        log=log,
    )
