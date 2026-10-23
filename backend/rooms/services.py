import secrets
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.utils import timezone

from accounts.nicknames import NicknameError, clean_nickname
from game.bonus_models import AiBot
from game.engine import GameError, room_name_for, validate_settings
from game.modes import (
    DIRKA_BOT_KEY,
    LOBBY_MODES,
    MODE_DIRKA,
    MODE_MULTIPLAYER,
    MP_MAX_PLAYERS,
    MP_MIN_PLAYERS,
    ROOM_IDLE_SECONDS,
)
from game.seed_content import ensure_bots
from rooms.models import Room, RoomMember

User = get_user_model()
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _bots_for_mode(mode):
    active = list(AiBot.objects.filter(is_active=True).order_by("order", "name"))
    matched = [bot for bot in active if mode in (bot.modes or [])]
    if matched:
        return matched
    # Stari boti brez modes: dirka po ključu, ostali za Hitra tekma.
    if mode == MODE_DIRKA:
        return [bot for bot in active if bot.key == DIRKA_BOT_KEY]
    return [bot for bot in active if bot.key != DIRKA_BOT_KEY]


def _new_code():
    return "".join(secrets.choice(ALPHABET) for _ in range(6))


def create_solo_room(user, raw):
    nickname = clean_nickname(raw.get("nickname") or user.nickname)
    settings = validate_settings(raw if isinstance(raw, dict) else {})
    if settings.get("mode") in LOBBY_MODES:
        raise GameError("Za več igralcev uporabi ustvari večigralsko sobo.")
    for _ in range(20):
        code = _new_code()
        try:
            with transaction.atomic():
                room = Room.objects.create(
                    code=code,
                    host=user,
                    visibility="unlisted",
                    status="waiting",
                    settings=settings,
                    max_players=1,
                    name=room_name_for(settings.get("mode")),
                )
                RoomMember.objects.create(
                    room=room,
                    user=user,
                    nickname_in_room=nickname,
                    color=user.preferred_color or "#e6b325",
                    is_host=True,
                    is_ready=True,
                )
        except IntegrityError:
            continue
        _remember_nickname(user, nickname)
        return room
    raise GameError("Sobe ni bilo mogoče ustvariti.")


def create_multiplayer_room(user, raw):
    close_stale_rooms()
    raw = raw if isinstance(raw, dict) else {}
    nickname = clean_nickname(raw.get("nickname") or user.nickname)
    payload = dict(raw)
    mode = str(raw.get("mode") or MODE_MULTIPLAYER).strip()
    if mode not in LOBBY_MODES:
        mode = MODE_MULTIPLAYER
    payload["mode"] = mode
    settings = validate_settings(payload)
    visibility = str(raw.get("visibility") or "public").strip()
    if visibility not in {"public", "private", "unlisted"}:
        raise GameError("Neznana vidnost sobe.")
    password = str(raw.get("password") or "").strip()
    if visibility == "private" and not password:
        raise GameError("Zasebna soba potrebuje geslo.")
    if visibility != "private":
        password = ""
    try:
        max_players = int(raw.get("max_players") or 4)
    except (TypeError, ValueError):
        raise GameError("Število igralcev ni veljavno.")
    if not MP_MIN_PLAYERS <= max_players <= MP_MAX_PLAYERS:
        raise GameError(f"Število igralcev mora biti med {MP_MIN_PLAYERS} in {MP_MAX_PLAYERS}.")
    bot_count = int(settings.get("bot_count") or 0)
    if bot_count > max_players - 1:
        settings["bot_count"] = max(0, max_players - 1)

    for _ in range(20):
        code = _new_code()
        try:
            with transaction.atomic():
                room = Room.objects.create(
                    code=code,
                    host=user,
                    visibility=visibility,
                    status="waiting",
                    settings={**settings, "invites": []},
                    max_players=max_players,
                    name=str(raw.get("name") or "").strip() or room_name_for(mode),
                )
                if password:
                    room.set_password(password)
                    room.save(update_fields=["password"])
                RoomMember.objects.create(
                    room=room,
                    user=user,
                    nickname_in_room=nickname,
                    color=user.preferred_color or "#e6b325",
                    is_host=True,
                    is_ready=False,
                )
                sync_room_bots(room)
        except IntegrityError:
            continue
        _remember_nickname(user, nickname)
        return room
    raise GameError("Sobe ni bilo mogoče ustvariti.")


def join_room(user, code, raw):
    close_stale_rooms()
    raw = raw if isinstance(raw, dict) else {}
    room = Room.objects.filter(code=code.upper()).first()
    if room is None:
        raise GameError("Soba ne obstaja.")
    if room.status != "waiting":
        raise GameError("Igra je že v teku ali končana.")
    if (room.settings or {}).get("mode") not in LOBBY_MODES:
        raise GameError("To ni večigralska soba.")
    if not room.check_password(str(raw.get("password") or "")):
        raise GameError("Napačno geslo.")
    active = room.members.filter(left_at__isnull=True)
    existing = active.filter(user=user).first()
    if existing:
        return room
    if active.count() >= room.max_players:
        raise GameError("Soba je polna.")
    nickname = clean_nickname(raw.get("nickname") or user.nickname)
    if active.filter(nickname_in_room__iexact=nickname).exists():
        raise NicknameError("Ta vzdevek je v sobi že zaseden.")
    try:
        RoomMember.objects.create(
            room=room,
            user=user,
            nickname_in_room=nickname,
            color=user.preferred_color or "#7dcea0",
            is_host=False,
            is_ready=False,
        )
    except IntegrityError:
        raise NicknameError("Ta vzdevek je v sobi že zaseden.")
    _remember_nickname(user, nickname)
    touch_room(room)
    return room


def update_room_settings(user, code, raw):
    room = _host_waiting_room(user, code)
    raw = raw if isinstance(raw, dict) else {}
    payload = dict(raw)
    payload["mode"] = (room.settings or {}).get("mode") or MODE_MULTIPLAYER
    settings = validate_settings(payload)
    visibility = str(raw.get("visibility") or room.visibility).strip()
    if visibility not in {"public", "private", "unlisted"}:
        raise GameError("Neznana vidnost sobe.")
    password = str(raw.get("password") or "").strip()
    if visibility == "private":
        if password:
            room.set_password(password)
        elif not room.password:
            raise GameError("Zasebna soba potrebuje geslo.")
    else:
        room.password = ""
    try:
        max_players = int(raw.get("max_players") or room.max_players)
    except (TypeError, ValueError):
        raise GameError("Število igralcev ni veljavno.")
    if not MP_MIN_PLAYERS <= max_players <= MP_MAX_PLAYERS:
        raise GameError(f"Število igralcev mora biti med {MP_MIN_PLAYERS} in {MP_MAX_PLAYERS}.")
    humans = room.members.filter(left_at__isnull=True, is_bot=False).count()
    if max_players < humans:
        raise GameError("V sobi je že več igralcev, kot dovoljuješ.")
    bot_count = int(settings.get("bot_count") or 0)
    slots = max(0, max_players - humans)
    if bot_count > slots:
        settings["bot_count"] = slots
    invites = list((room.settings or {}).get("invites") or [])
    room.visibility = visibility
    room.max_players = max_players
    if raw.get("name") is not None:
        room.name = str(raw.get("name") or "").strip() or room_name_for(settings.get("mode"))
    room.settings = {**settings, "invites": invites}
    room.last_activity = timezone.now()
    room.save(update_fields=["visibility", "password", "max_players", "name", "settings", "last_activity"])
    sync_room_bots(room)
    room.members.filter(left_at__isnull=True, is_host=False, is_bot=False).update(is_ready=False)
    return room


def touch_room(room):
    room.last_activity = timezone.now()
    room.save(update_fields=["last_activity"])
    return room


def close_room(room, reason="closed"):
    """Zapri sobo (admin / nedejavnost). Aktivno sejo označi kot aborted."""
    if room.status in {"finished", "closed"}:
        return room
    now = timezone.now()
    room.status = "closed"
    room.finished_at = now
    room.last_activity = now
    settings = dict(room.settings or {})
    settings["close_reason"] = reason
    room.settings = settings
    room.save(update_fields=["status", "finished_at", "last_activity", "settings"])
    from game.models import GameSession

    session = GameSession.objects.filter(room=room).first()
    if session is not None and session.status in {"preparing", "active"}:
        state = dict(session.state or {})
        state["reason"] = reason
        session.status = "aborted"
        session.finished_at = now
        session.state = state
        session.save(update_fields=["status", "finished_at", "state"])
    return room


def close_stale_rooms():
    """Zapri waiting/playing sobe brez aktivnosti več kot ROOM_IDLE_SECONDS.

    Aktivne seje (preparing/active) pusti pri miru — last_activity se ob
    odgovorih ne posodablja vedno, zato idle close ne sme ubiti igre.
    """
    from game.models import GameSession

    cutoff = timezone.now() - timedelta(seconds=ROOM_IDLE_SECONDS)
    live_session_room_ids = GameSession.objects.filter(status__in=["preparing", "active"]).values_list(
        "room_id", flat=True
    )
    stale = Room.objects.filter(status__in=["waiting", "playing"], last_activity__lt=cutoff).exclude(
        pk__in=live_session_room_ids
    )
    closed = 0
    for room in stale.iterator():
        close_room(room, reason="inactive")
        closed += 1
    return closed


def sync_room_bots(room):
    ensure_bots()
    want = int((room.settings or {}).get("bot_count") or 0)
    active = list(room.members.filter(left_at__isnull=True))
    bots = [item for item in active if item.is_bot]
    humans = [item for item in active if not item.is_bot]
    if want > room.max_players - len(humans):
        want = max(0, room.max_players - len(humans))
        settings = dict(room.settings or {})
        settings["bot_count"] = want
        room.settings = settings
        room.save(update_fields=["settings"])
    while len(bots) > want:
        bot = bots.pop()
        bot.left_at = timezone.now()
        bot.is_connected = False
        bot.save(update_fields=["left_at", "is_connected"])
    mode = (room.settings or {}).get("mode") or MODE_MULTIPLAYER
    profiles = _bots_for_mode(mode)
    used_profiles = {item.bot_profile_id for item in bots if item.bot_profile_id}
    used_nicks = {item.nickname_in_room for item in room.members.filter(left_at__isnull=True)}
    while len(bots) < want:
        profile = next((item for item in profiles if item.id not in used_profiles), None)
        reused = False
        if profile is None and profiles:
            profile = profiles[len(bots) % len(profiles)]
            reused = True
        if profile is None:
            nick = f"Bot {len(bots) + 1}"
            while nick in used_nicks:
                nick = f"Bot {len(used_nicks) + 1}"
            color = "#7dcea0"
            bot_profile = None
        else:
            nick = profile.name if not reused else f"{profile.name} {len(bots) + 1}"
            while nick in used_nicks:
                nick = f"{profile.name} {len(used_nicks) + 1}"
            color = profile.color or "#7dcea0"
            bot_profile = profile
            if not reused:
                used_profiles.add(profile.id)
        used_nicks.add(nick)
        bot = RoomMember.objects.create(
            room=room,
            user=None,
            nickname_in_room=nick[:30],
            color=color,
            is_host=False,
            is_ready=True,
            is_connected=True,
            is_bot=True,
            bot_profile=bot_profile,
        )
        bots.append(bot)
    room.members.filter(left_at__isnull=True, is_bot=True).update(is_ready=True, is_connected=True)
    touch_room(room)
    return room


def set_ready(user, code, ready):
    room = Room.objects.filter(code=code.upper()).first()
    if room is None:
        raise GameError("Soba ne obstaja.")
    if room.status != "waiting":
        raise GameError("Pripravljenosti ni mogoče spremeniti.")
    member = room.members.filter(user=user, left_at__isnull=True, is_bot=False).first()
    if member is None:
        raise GameError("Nisi v sobi.")
    member.is_ready = bool(ready)
    member.save(update_fields=["is_ready", "last_activity"])
    touch_room(room)
    return room


def invite_user(user, code, raw):
    room = _host_waiting_room(user, code)
    raw = raw if isinstance(raw, dict) else {}
    query = str(raw.get("nickname") or raw.get("q") or "").strip()
    if len(query) < 2:
        raise GameError("Vpiši vsaj 2 znaka za iskanje.")
    target = (
        User.objects.filter(is_guest=False, nickname__iexact=query).first()
        or User.objects.filter(is_guest=False, email__iexact=query).first()
    )
    if target is None:
        raise GameError("Uporabnik ni najden.")
    if target.id == user.id:
        raise GameError("Ne moreš povabiti sebe.")
    if room.members.filter(user=target, left_at__isnull=True).exists():
        raise GameError("Uporabnik je že v sobi.")
    settings = dict(room.settings or {})
    invites = list(settings.get("invites") or [])
    if any(item.get("user_id") == target.id for item in invites):
        return room
    invites.append(
        {
            "user_id": target.id,
            "nickname": target.nickname or target.email or "igralec",
            "invited_at": timezone.now().isoformat(),
        }
    )
    settings["invites"] = invites
    room.settings = settings
    room.save(update_fields=["settings"])
    return room


def list_public_rooms(mode=None):
    close_stale_rooms()
    rooms = Room.objects.filter(status="waiting", visibility="public").select_related("host").order_by("-created_at")
    if mode in LOBBY_MODES:
        rooms = rooms.filter(settings__mode=mode)
    else:
        rooms = rooms.filter(settings__mode__in=list(LOBBY_MODES))
    return [lobby_payload(room, viewer=None) for room in rooms[:30]]


def list_invites(user, mode=None):
    close_stale_rooms()
    rooms = Room.objects.filter(status="waiting").order_by("-created_at")
    if mode in LOBBY_MODES:
        rooms = rooms.filter(settings__mode=mode)
    else:
        rooms = rooms.filter(settings__mode__in=list(LOBBY_MODES))
    rooms = rooms[:80]
    rows = []
    for room in rooms:
        invites = (room.settings or {}).get("invites") or []
        if any(item.get("user_id") == user.id for item in invites):
            rows.append(lobby_payload(room, viewer=user))
    return rows


def lobby_payload(room, viewer=None):
    members = list(room.members.filter(left_at__isnull=True).select_related("user").order_by("joined_at"))
    viewer_member = None
    if viewer is not None:
        viewer_member = next((item for item in members if item.user_id == viewer.id), None)
    host_member = next((item for item in members if item.is_host), None)
    return {
        "code": room.code,
        "name": room.name,
        "status": room.status,
        "visibility": room.visibility,
        "has_password": bool(room.password),
        "max_players": room.max_players,
        "settings": {
            "mode": (room.settings or {}).get("mode"),
            "question_count": (room.settings or {}).get("question_count"),
            "time_limit_seconds": (room.settings or {}).get("time_limit_seconds"),
            "categories": (room.settings or {}).get("categories") or [],
            "sudden_death": bool((room.settings or {}).get("sudden_death")),
            "bot_count": int((room.settings or {}).get("bot_count") or 0),
            "target_score": (room.settings or {}).get("target_score"),
            "safe_every": (room.settings or {}).get("safe_every"),
        },
        "members": [
            {
                "id": str(member.id),
                "nickname": member.nickname_in_room,
                "color": member.color,
                "is_host": member.is_host,
                "is_ready": member.is_ready or member.is_bot,
                "is_connected": member.is_connected or member.is_bot,
                "is_bot": member.is_bot,
                "is_you": viewer is not None and member.user_id == viewer.id,
            }
            for member in members
        ],
        "member_count": len(members),
        "all_ready": bool(members)
        and len(members) >= MP_MIN_PLAYERS
        and all(member.is_ready or member.is_bot for member in members),
        "can_start": False,
        "is_host": bool(viewer_member and viewer_member.is_host),
        "host_member_id": str(host_member.id) if host_member else None,
        "host_nickname": host_member.nickname_in_room if host_member else (room.host.nickname if room.host_id else ""),
        "you": (
            {
                "id": str(viewer_member.id),
                "nickname": viewer_member.nickname_in_room,
                "is_host": viewer_member.is_host,
                "is_ready": viewer_member.is_ready,
            }
            if viewer_member
            else None
        ),
        "link": f"/igra/{room.code}",
    }


def refresh_can_start(payload):
    members = payload.get("members") or []
    enough = len(members) >= MP_MIN_PLAYERS
    all_ready = enough and all(item["is_ready"] or item.get("is_bot") for item in members)
    payload["all_ready"] = all_ready
    payload["can_start"] = bool(payload.get("is_host") and all_ready and payload.get("status") == "waiting")
    return payload


def room_payload(room, viewer=None):
    mode = (room.settings or {}).get("mode")
    if mode in LOBBY_MODES:
        return refresh_can_start(lobby_payload(room, viewer=viewer))
    return {
        "code": room.code,
        "name": room.name,
        "status": room.status,
        "visibility": room.visibility,
        "max_players": room.max_players,
        "settings": room.settings,
    }


def _host_waiting_room(user, code):
    room = Room.objects.filter(code=code.upper()).first()
    if room is None:
        raise GameError("Soba ne obstaja.")
    if room.status != "waiting":
        raise GameError("Nastavitev ni mogoče spremeniti.")
    if room.host_id != user.id:
        raise GameError("Samo gostitelj lahko to stori.")
    if (room.settings or {}).get("mode") not in LOBBY_MODES:
        raise GameError("To ni večigralska soba.")
    return room


def _remember_nickname(user, nickname):
    if not user.nickname:
        user.nickname = nickname
        user.save(update_fields=["nickname"])
