"""Usklajen countdown pred štartom lobija (multiplayer / dirka)."""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from game.engine import GameError, _lock
from game.modes import LOBBY_MODES, MODE_DIRKA
from game.site_settings import get as site_get

COUNTDOWN_STEPS = 3
COUNTDOWN_HOLD_MS = 550
COUNTDOWN_TOTAL_MS = COUNTDOWN_STEPS * 1000 + COUNTDOWN_HOLD_MS
COUNTDOWN_KEY = "lobby_countdown_ends_at"


def _parse_ends(raw):
    if not raw:
        return None
    ends = parse_datetime(str(raw))
    if ends is None:
        return None
    if timezone.is_naive(ends):
        ends = timezone.make_aware(ends, timezone.get_current_timezone())
    return ends


def countdown_payload(room, ends, now=None):
    now = now or timezone.now()
    mode = (room.settings or {}).get("mode")
    return {
        "type": "countdown",
        "phase": "countdown",
        "mode": mode,
        "countdown_ends_at": ends.isoformat(),
        "server_now": now.isoformat(),
        "countdown_steps": COUNTDOWN_STEPS,
        "room_code": room.code,
    }


def active_countdown_payload(room, now=None):
    """Če teče lobby countdown, vrni payload — sicer None."""
    now = now or timezone.now()
    ends = _parse_ends((room.settings or {}).get(COUNTDOWN_KEY))
    if ends is None or ends <= now:
        return None
    return countdown_payload(room, ends, now)


def begin_lobby_countdown(member_id):
    """Host začne usklajen 3→2→1; soba ostane waiting do commit."""
    with transaction.atomic():
        member, room, session = _lock(member_id)
        if session is not None:
            raise GameError("Igra je že v teku.")
        if not member.is_host:
            raise GameError("Samo gostitelj lahko začne igro.")
        if room.status != "waiting":
            raise GameError("Igre ni mogoče začeti.")
        mode = (room.settings or {}).get("mode")
        if mode not in LOBBY_MODES:
            raise GameError("Ta način nima lobija.")
        members = list(room.members.filter(left_at__isnull=True))
        if len(members) < int(site_get("mp_min_players")):
            min_players = int(site_get("mp_min_players"))
            raise GameError(f"Potrebujeta vsaj {min_players} igralca.")
        if not all(item.is_ready or item.is_bot for item in members):
            raise GameError("Vsi igralci morajo biti pripravljeni.")
        if mode == MODE_DIRKA:
            settings = room.settings or {}
            from game.dirka import _available_count

            pool_size = min(int(site_get("dirka_question_pool")), _available_count(settings))
            if pool_size < 5:
                raise GameError("Premalo vprašanj v izbranih kategorijah.")

        now = timezone.now()
        settings = dict(room.settings or {})
        existing = _parse_ends(settings.get(COUNTDOWN_KEY))
        if existing is not None and existing > now:
            return [countdown_payload(room, existing, now)]

        ends = now + timedelta(milliseconds=COUNTDOWN_TOTAL_MS)
        settings[COUNTDOWN_KEY] = ends.isoformat()
        room.settings = settings
        room.last_activity = now
        room.save(update_fields=["settings", "last_activity"])
        return [countdown_payload(room, ends, now)]


def claim_commit_lobby_start(member_id):
    """
    Po izteku countdowna: prvi klic zbriše flag in zažene igro.
    Ostali dobijo [] (že v teku / še prezgodaj).
    Če start pade, sporoči napako in pusti sobo v waiting (H6).
    """
    saved_ends = None
    with transaction.atomic():
        member, room, session = _lock(member_id)
        if session is not None:
            return []
        if room.status != "waiting":
            return []
        mode = (room.settings or {}).get("mode")
        if mode not in LOBBY_MODES:
            return []
        settings = dict(room.settings or {})
        ends = _parse_ends(settings.get(COUNTDOWN_KEY))
        if ends is None:
            return []
        now = timezone.now()
        # Majhen zamik dovoljen zaradi clock/sleep; prezgodnji klici ne smejo štartati.
        if now + timedelta(milliseconds=400) < ends:
            return []
        saved_ends = ends.isoformat()
        settings.pop(COUNTDOWN_KEY, None)
        room.settings = settings
        room.last_activity = now
        room.save(update_fields=["settings", "last_activity"])
        host = room.members.filter(is_host=True, left_at__isnull=True).first()
        start_as = str(host.id) if host else str(member.id)
        room_id = room.id

    try:
        if mode == MODE_DIRKA:
            from game.dirka import start_dirka

            return start_dirka(start_as)
        from game.multiplayer import start_multiplayer

        return start_multiplayer(start_as)
    except GameError as exc:
        from rooms.models import Room

        room = Room.objects.filter(pk=room_id).first()
        if room is not None and room.status == "waiting" and saved_ends:
            settings = dict(room.settings or {})
            # Ne obnavljaj countdown — host mora znova klikniti; sporočilo gre ven.
            settings.pop(COUNTDOWN_KEY, None)
            room.settings = settings
            room.save(update_fields=["settings"])
        return [
            {
                "type": "error",
                "phase": "lobby",
                "message": exc.message,
            }
        ]


def clear_lobby_countdown(room):
    settings = dict(room.settings or {})
    if COUNTDOWN_KEY not in settings:
        return False
    settings.pop(COUNTDOWN_KEY, None)
    room.settings = settings
    room.save(update_fields=["settings"])
    return True
