import random
import secrets
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.utils import timezone

from accounts.nicknames import NicknameError, avatar_for_member, clean_nickname
from game.bonus_models import AiBot
from game.engine import GameError, room_name_for, validate_settings
from game.modes import (
    DIRKA_BOT_KEY,
    LOBBY_MODES,
    MODE_DIRKA,
    MODE_MULTIPLAYER,
)
from game.seed_content import ensure_bots
from game.site_settings import get as site_get
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
    max_players_cap = int(site_get("mp_max_players"))
    min_players = int(site_get("mp_min_players"))
    if not min_players <= max_players <= max_players_cap:
        raise GameError(f"Število igralcev mora biti med {min_players} in {max_players_cap}.")
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
    invited = any(
        int(item.get("user_id") or 0) == int(user.id)
        for item in ((room.settings or {}).get("invites") or [])
        if isinstance(item, dict)
    )
    if not invited and not room.check_password(str(raw.get("password") or "")):
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
    max_players_cap = int(site_get("mp_max_players"))
    min_players = int(site_get("mp_min_players"))
    if not min_players <= max_players <= max_players_cap:
        raise GameError(f"Število igralcev mora biti med {min_players} in {max_players_cap}.")
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

    session = (
        GameSession.objects.filter(room=room, status__in=["preparing", "active"])
        .order_by("-created_at")
        .first()
    )
    if session is not None:
        state = dict(session.state or {})
        state["reason"] = reason
        session.status = "aborted"
        session.finished_at = now
        session.state = state
        session.save(update_fields=["status", "finished_at", "state"])
    _notify_room_closed(room)
    return room


def admin_kick_member(room, member_id):
    """Admin: vrzi igralca/bota iz žive sobe (ne hosta)."""
    if room.status not in {"waiting", "playing"}:
        raise GameError("Soba ni aktivna.")
    return _kick_member(room, member_id)


def host_kick_member(user, code, member_id):
    """Host: vrzi igralca/bota iz lobbyja (ne sebe)."""
    room = Room.objects.filter(code=str(code or "").upper()).first()
    if room is None:
        raise GameError("Soba ne obstaja.")
    if room.status != "waiting":
        raise GameError("Igralca lahko vržeš samo v lobbyju.")
    host = room.members.filter(user=user, left_at__isnull=True, is_host=True, is_bot=False).first()
    if host is None:
        raise GameError("Samo host lahko vrže igralca.")
    member = _kick_member(room, member_id)
    touch_room(room)
    return room, member


def _kick_member(room, member_id):
    member = room.members.filter(pk=member_id, left_at__isnull=True).first()
    if member is None:
        raise GameError("Igralec ni v sobi.")
    if member.is_host:
        raise GameError("Hosta ne moreš vreči — zapri sobo.")
    now = timezone.now()
    member.left_at = now
    member.is_connected = False
    member.is_ready = False
    member.save(update_fields=["left_at", "is_connected", "is_ready"])
    room.last_activity = now
    room.save(update_fields=["last_activity"])
    if member.is_bot:
        settings = dict(room.settings or {})
        settings["bot_count"] = max(0, int(settings.get("bot_count") or 0) - 1)
        room.settings = settings
        room.save(update_fields=["settings"])
    return member


def notify_room_lobby(room, *, lobby_event=None, lobby_event_member_id=None, kicked_message=None):
    """Pošlji lobby osvežitev (opcijsko z dogodkom join/leave/kick)."""
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer
        from game.modes import LOBBY_MODES

        layer = get_channel_layer()
        if layer is None:
            return
        mode = (room.settings or {}).get("mode")
        if room.status != "waiting" or mode not in LOBBY_MODES:
            return
        payload = refresh_can_start(lobby_payload(room, viewer=None))
        payload["type"] = "lobby"
        payload["phase"] = "lobby"
        payload["mode"] = mode
        if lobby_event:
            payload["lobby_event"] = lobby_event
        if lobby_event_member_id:
            payload["lobby_event_member_id"] = str(lobby_event_member_id)
        if kicked_message:
            payload["kicked_message"] = kicked_message
        async_to_sync(layer.group_send)(
            f"room_{room.code}",
            {"type": "game.event", "payload": payload},
        )
    except Exception:
        pass


def _notify_room_closed(room):
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer

        layer = get_channel_layer()
        if layer is None:
            return
        async_to_sync(layer.group_send)(
            f"room_{room.code}",
            {
                "type": "game.event",
                "payload": {
                    "type": "lobby",
                    "phase": "closed",
                    "status": "closed",
                    "code": room.code,
                    "detail": "Soba je zaprta.",
                },
            },
        )
    except Exception:
        pass


def close_stale_rooms(*, force=False):
    """Zapri waiting/playing sobe brez aktivnosti več kot room_idle_seconds.

    Aktivne seje (preparing/active) pusti pri miru — last_activity se ob
    odgovorih ne posodablja vedno, zato idle close ne sme ubiti igre.

    Throttle: največ enkrat na ~45 s (razen force=True), da GET lobby/list
    ne piše v bazo ob vsakem klicu (H7).
    """
    from django.core.cache import cache

    from game.models import GameSession

    throttle_key = "close_stale_rooms_tick"
    if not force and cache.get(throttle_key):
        return 0
    cache.set(throttle_key, 1, timeout=45)

    cutoff = timezone.now() - timedelta(seconds=int(site_get("room_idle_seconds")))
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


def close_live_rooms():
    """Admin: zapri vse sobe v čakanju ali teku (tudi aktivne igre)."""
    live = Room.objects.filter(status__in=["waiting", "playing"]).order_by("created_at")
    closed = 0
    for room in live.iterator():
        close_room(room, reason="admin_bulk")
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
    # V lobbyju bote odstranimo (ne soft-leave) — sicer unique (room, nick) blokira ponovni add.
    while len(bots) > want:
        bot = bots.pop()
        bot.delete()
    mode = (room.settings or {}).get("mode") or MODE_MULTIPLAYER
    profiles = _bots_for_mode(mode)
    used_profiles = {item.bot_profile_id for item in bots if item.bot_profile_id}
    # Vključno z morebitnimi starimi left boti (če še obstajajo).
    used_nicks = {item.nickname_in_room for item in room.members.all()}
    # Po kicku: počisti leftover soft-left bote — novi se izberejo random.
    room.members.filter(left_at__isnull=False, is_bot=True).delete()
    while len(bots) < want:
        free = [item for item in profiles if item.id not in used_profiles]
        reused = False
        if free:
            profile = random.choice(free)
        elif profiles:
            profile = random.choice(profiles)
            reused = True
        else:
            profile = None
        if profile is None:
            nick = f"Bot {len(bots) + 1}"
            n = 1
            while nick in used_nicks:
                n += 1
                nick = f"Bot {n}"
            color = "#7dcea0"
            bot_profile = None
        else:
            nick = profile.name if not reused else f"{profile.name} {len(bots) + 1}"
            n = 1
            base = profile.name
            while nick in used_nicks:
                n += 1
                nick = f"{base} {n}"
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


def _notify_user_invite(user_id, invite_payload):
    """Takojšnje obvestilo na /ws/notify/ (če je uporabnik povezan)."""
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer

        layer = get_channel_layer()
        if layer is None:
            return
        async_to_sync(layer.group_send)(
            f"user_{user_id}",
            {"type": "user.invite", "invite": invite_payload},
        )
    except Exception:
        # Obvestilo je best-effort; polling v UI še vedno ujame.
        return


def invite_user(user, code, raw):
    room = _host_waiting_room(user, code)
    raw = raw if isinstance(raw, dict) else {}
    query = str(raw.get("nickname") or raw.get("q") or "").strip()
    if len(query) < 2:
        raise GameError("Vpiši vsaj 2 znaka za vzdevek.")
    # Samo registrirani uporabniki (imajo e-pošto), iskanje izključno po vzdevku.
    target = (
        User.objects.filter(email__isnull=False, nickname__iexact=query)
        .exclude(email="")
        .first()
    )
    # Enoten / tih odgovor — ne razkrivaj, ali vzdevek obstaja (V7).
    if target is None or target.id == user.id:
        return room
    if room.members.filter(user=target, left_at__isnull=True).exists():
        return room
    settings = dict(room.settings or {})
    invites = list(settings.get("invites") or [])
    if any(item.get("user_id") == target.id for item in invites):
        return room
    from_nickname = (user.nickname or "").strip() or (user.email or "host")
    invite = {
        "user_id": target.id,
        "nickname": (target.nickname or "").strip() or "igralec",
        "from_user_id": user.id,
        "from_nickname": from_nickname,
        "invited_at": timezone.now().isoformat(),
    }
    invites.append(invite)
    settings["invites"] = invites
    room.settings = settings
    room.save(update_fields=["settings"])
    mode = settings.get("mode")
    _notify_user_invite(
        target.id,
        {
            "code": room.code,
            "name": room.name or "",
            "mode": mode,
            "from_nickname": from_nickname,
            "host_nickname": from_nickname,
            "link": f"/igra/{room.code}",
            "invited_at": invite["invited_at"],
            "settings": {
                "mode": mode,
                "target_score": settings.get("target_score"),
                "safe_every": settings.get("safe_every"),
                "question_count": settings.get("question_count"),
                "time_limit_seconds": settings.get("time_limit_seconds"),
            },
            "member_count": room.members.filter(left_at__isnull=True).count(),
            "max_players": room.max_players,
        },
    )
    return room


def list_public_rooms(mode=None):
    close_stale_rooms()
    rooms = Room.objects.filter(status="waiting", visibility="public").select_related("host").order_by("-created_at")
    if mode in LOBBY_MODES:
        rooms = rooms.filter(settings__mode=mode)
    else:
        rooms = rooms.filter(settings__mode__in=list(LOBBY_MODES))
    return [lobby_payload(room, viewer=None) for room in rooms[:30]]


def quick_join(user, raw):
    """Pridruži se odprti javni sobi ali ustvari novo (Hitra tekma / Dirka)."""
    from questions.models import Category

    close_stale_rooms()
    raw = raw if isinstance(raw, dict) else {}
    mode = str(raw.get("mode") or MODE_MULTIPLAYER).strip()
    if mode not in LOBBY_MODES:
        raise GameError("Hitri join je na voljo samo za Hitra tekma in Dirka.")
    nickname = clean_nickname(raw.get("nickname") or user.nickname)

    rooms = (
        Room.objects.filter(status="waiting", visibility="public", settings__mode=mode)
        .select_related("host")
        .order_by("created_at")
    )
    for room in rooms[:40]:
        if room.password:
            continue
        active = room.members.filter(left_at__isnull=True)
        if active.filter(user=user).exists():
            return room, False
        if active.count() >= room.max_players:
            continue
        try:
            join_room(user, room.code, {"nickname": nickname, "password": ""})
            return room, False
        except (GameError, NicknameError):
            continue

    categories = raw.get("categories")
    if not isinstance(categories, list) or not categories:
        categories = list(Category.objects.filter(is_active=True).values_list("slug", flat=True)[:40])
    if not categories:
        raise GameError("Ni aktivnih kategorij za novo sobo.")

    create_raw = {
        "mode": mode,
        "nickname": nickname,
        "visibility": "public",
        "max_players": int(raw.get("max_players") or 4),
        "categories": categories,
    }
    if mode == MODE_DIRKA:
        targets = list(site_get("dirka_target_scores") or [200])
        safes = list(site_get("dirka_safe_every") or [5])
        dirka_times = list(site_get("dirka_allowed_times") or [30])
        default_time = int(site_get("dirka_time_seconds") or 30)
        create_raw["target_score"] = raw.get("target_score", 200 if 200 in targets else targets[0])
        create_raw["safe_every"] = raw.get("safe_every", 5 if 5 in safes else safes[0])
        create_raw["time_limit_seconds"] = raw.get(
            "time_limit_seconds",
            default_time if default_time in dirka_times else dirka_times[0],
        )
        create_raw["bot_count"] = raw.get("bot_count", 1)
    else:
        mp_counts = list(site_get("mp_question_counts") or [10])
        mp_times = list(site_get("mp_allowed_times") or [60])
        create_raw["question_count"] = raw.get("question_count", 10 if 10 in mp_counts else mp_counts[0])
        create_raw["time_limit_seconds"] = raw.get(
            "time_limit_seconds", 60 if 60 in mp_times else mp_times[0]
        )
        create_raw["bot_count"] = raw.get("bot_count", 0)
    room = create_multiplayer_room(user, create_raw)
    return room, True


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
        mine = next(
            (
                item
                for item in invites
                if isinstance(item, dict) and int(item.get("user_id") or 0) == int(user.id)
            ),
            None,
        )
        if mine is None:
            continue
        payload = lobby_payload(room, viewer=user)
        payload["invite_from"] = mine.get("from_nickname") or payload.get("host_nickname") or ""
        payload["invited_at"] = mine.get("invited_at") or ""
        rows.append(payload)
    return rows


def lobby_payload(room, viewer=None):
    members = list(
        room.members.filter(left_at__isnull=True).select_related("user", "bot_profile").order_by("joined_at")
    )
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
                "avatar": avatar_for_member(member),
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
        and len(members) >= int(site_get("mp_min_players"))
        and all(member.is_ready or member.is_bot for member in members),
        "can_start": False,
        "is_host": bool(viewer_member and viewer_member.is_host),
        "host_member_id": str(host_member.id) if host_member else None,
        "host_nickname": host_member.nickname_in_room if host_member else (room.host.nickname if room.host_id else ""),
        "you": (
            {
                "id": str(viewer_member.id),
                "nickname": viewer_member.nickname_in_room,
                "avatar": avatar_for_member(viewer_member),
                "color": viewer_member.color,
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
    enough = len(members) >= int(site_get("mp_min_players"))
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


def rematch_room(user, code):
    """Host: po končani MP/Dirki tekmi ponovno odpri lobby v isti sobi.

    Stare GameSession/GameResult/replay ostanejo (več sej na sobo);
    člani ostanejo, status sobe gre nazaj na waiting.
    """
    room = Room.objects.filter(code=str(code or "").upper()).select_related("host").first()
    if room is None:
        raise GameError("Soba ne obstaja.")
    if room.status != "finished":
        raise GameError("Ponovitev je mogoča samo po končani tekmi.")
    if (room.settings or {}).get("mode") not in LOBBY_MODES:
        raise GameError("Ponovitev je na voljo samo za Hitra tekma / Dirka.")
    if room.host_id != user.id:
        raise GameError("Samo gostitelj lahko začne novo rundo v isti sobi.")
    host_member = room.members.filter(user=user, left_at__isnull=True, is_bot=False).first()
    if host_member is None:
        raise GameError("Nisi več v sobi.")

    room.status = "waiting"
    room.finished_at = None
    room.last_activity = timezone.now()
    settings = dict(room.settings or {})
    settings.pop("lobby_countdown_ends_at", None)
    room.settings = settings
    room.save(update_fields=["status", "finished_at", "last_activity", "settings"])

    room.members.filter(left_at__isnull=True, is_bot=False).update(is_ready=False, is_host=False)
    host_member.is_host = True
    host_member.is_ready = True
    host_member.is_connected = True
    host_member.save(update_fields=["is_host", "is_ready", "is_connected", "last_activity"])

    sync_room_bots(room)
    touch_room(room)
    return room


def leave_room(user, code):
    """Igralec zapusti sobo (lobby ali med igro). Ostali ne smejo ostati zataknjeni."""
    room = Room.objects.filter(code=str(code or "").upper()).first()
    if room is None:
        raise GameError("Soba ne obstaja.")
    if room.status in {"finished", "closed"}:
        member = room.members.filter(user=user, left_at__isnull=True, is_bot=False).first()
        if member is not None:
            member.left_at = timezone.now()
            member.is_connected = False
            member.is_host = False
            member.save(update_fields=["left_at", "is_connected", "is_host", "last_activity"])
        return room
    member = room.members.filter(user=user, left_at__isnull=True, is_bot=False).first()
    if member is None:
        raise GameError("Nisi v sobi.")
    now = timezone.now()
    was_host = member.is_host
    member.left_at = now
    member.is_connected = False
    member.is_ready = False
    member.is_host = False
    member.save(update_fields=["left_at", "is_connected", "is_ready", "is_host", "last_activity"])

    remaining = list(room.members.filter(left_at__isnull=True).order_by("joined_at"))
    humans = [item for item in remaining if not item.is_bot]

    if was_host and humans:
        new_host = humans[0]
        new_host.is_host = True
        new_host.save(update_fields=["is_host", "last_activity"])
        room.host = new_host.user
        room.save(update_fields=["host", "last_activity"])
    elif not humans:
        bots = [item for item in remaining if item.is_bot]
        if room.status == "playing" and bots:
            # Med igro: boti odigrajo preostanek (bot host + ozadje).
            new_host = bots[0]
            new_host.is_host = True
            new_host.save(update_fields=["is_host", "last_activity"])
            _reconcile_session_after_leave(room, member)
            touch_room(room)
            from game.bot_only import schedule_bot_only_continue

            schedule_bot_only_continue(room.id)
            return room
        # Lobby (ali igra brez botov): zapri — boti sami v čakalni sobi ne držijo sobe.
        room.status = "closed"
        room.finished_at = now
        room.save(update_fields=["status", "finished_at", "last_activity"])
        from game.models import GameSession

        GameSession.objects.filter(room=room, status="active").update(
            status="finished",
            finished_at=now,
        )
        touch_room(room)
        return room

    if room.status == "playing":
        _reconcile_session_after_leave(room, member)

    touch_room(room)
    return room


def _reconcile_session_after_leave(room, left_member):
    """Odstrani zapustnika iz aktivne seje (alive) — runda se lahko nadaljuje."""
    from game.models import GameSession

    session = GameSession.objects.filter(room=room, status="active").first()
    if session is None:
        return
    state = dict(session.state or {})
    mid = str(left_member.id)
    players = dict(state.get("players") or {})
    if mid in players:
        stats = dict(players[mid])
        stats["alive"] = False
        stats["left"] = True
        players[mid] = stats
        state["players"] = players
    alive = state.get("alive")
    if isinstance(alive, list) and mid in alive:
        state["alive"] = [item for item in alive if item != mid]
    session.state = state
    session.save(update_fields=["state"])


def _remember_nickname(user, nickname):
    if not user.nickname:
        user.nickname = nickname
        user.save(update_fields=["nickname"])
