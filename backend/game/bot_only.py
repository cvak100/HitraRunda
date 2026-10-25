"""Nadaljevanje seje, ko v sobi ostanejo samo boti (zadnji človek je odšel)."""

from __future__ import annotations

import logging
import threading

from django.db import close_old_connections, transaction

logger = logging.getLogger(__name__)


def schedule_bot_only_continue(room_id):
    """Po commitu poženi bot-only tekmo v ozadju (brez WS klienta)."""

    def _start():
        thread = threading.Thread(
            target=_run_safe,
            args=(str(room_id),),
            name=f"bot-only-{room_id}",
            daemon=True,
        )
        thread.start()

    transaction.on_commit(_start)


def _run_safe(room_id: str):
    close_old_connections()
    try:
        continue_bot_only_match(room_id)
    except Exception:
        logger.exception("Bot-only nadaljevanje spodletelo (room=%s)", room_id)
    finally:
        close_old_connections()


def continue_bot_only_match(room_id, max_rounds: int = 500) -> dict:
    """Sinhrono odigraj preostanek aktivne seje z boti (brez zamikov)."""
    from game.models import GameSession
    from game.simulate_lobby import run_lobby_match
    from rooms.models import Room

    room = Room.objects.filter(pk=room_id).first()
    if room is None or room.status != "playing":
        return {"reason": "not_playing"}
    if room.members.filter(left_at__isnull=True, is_bot=False).exists():
        return {"reason": "humans_present"}

    session = GameSession.objects.filter(room=room, status="active").first()
    if session is None:
        return {"reason": "no_session"}

    host = room.members.filter(left_at__isnull=True, is_host=True).first()
    if host is None:
        host = room.members.filter(left_at__isnull=True, is_bot=True).order_by("joined_at").first()
        if host is None:
            return {"reason": "no_bots"}
        host.is_host = True
        host.save(update_fields=["is_host", "last_activity"])

    return run_lobby_match(
        session,
        host_member_id=str(host.id),
        mode=session.mode,
        max_rounds=max_rounds,
        log=[],
    )
