import random
from datetime import timedelta

from django.db import transaction
from django.db.models import Count
from django.utils import timezone

from accounts.nicknames import resolve_avatar_key
from game.bonus_models import BonusDefinition, PhoneFriend
from game.errors import GameError
from game.lifelines import (
    apply_audience,
    apply_fifty_fifty,
    apply_phone_friend,
    initial_lifeline_state,
    mark_lifeline_used,
)
from game.modes import (
    ALA_OPTION_COUNT,
    ALA_QUESTION_TYPES,
    LOBBY_MODES,
    MODE_60_SEKUND,
    MODE_ALA_MILIJONAR,
    MODE_DIRKA,
    MODE_HITRARUNDA,
    MODE_LABELS,
    MODE_MULTIPLAYER,
    PLAYABLE_MODES,
    SIXTY_DIFFICULTY_PROFILES,
    SIXTY_QUESTION_TYPES,
)
from game.models import GameQuestion, GameResult, GameSession, PlayerAnswer
from game.presentation import ensure_presentation, public_question
from game.site_settings import get as site_get
from game.site_settings import get_int_set, get_skip_limits, is_mode_enabled
from questions.models import Category, Question
from rooms.models import Room, RoomMember

GRACE = timedelta(milliseconds=1500)
SINGLE_TYPES = {Question.Type.MULTIPLE_CHOICE, Question.Type.TRUE_FALSE}


def ladder_for(total):
    return list(site_get("ala_prize_ladder"))[:total]


def speed_bonus(time_taken_ms, time_limit_seconds):
    limit_ms = time_limit_seconds * 1000
    taken = max(0, time_taken_ms)
    if taken >= limit_ms:
        return 0
    max_bonus = int(site_get("hr_max_speed_bonus"))
    return round(((limit_ms - taken) / limit_ms) * max_bonus)


def official_end(game_question, session):
    return game_question.started_at + timedelta(seconds=session.time_limit_seconds)


def hard_end(game_question, session):
    return official_end(game_question, session) + GRACE


def validate_settings(raw):
    if not isinstance(raw, dict):
        raise GameError("Nastavitve niso veljavne.")
    mode = raw.get("mode") or MODE_HITRARUNDA
    if mode == "millionaire":
        mode = MODE_HITRARUNDA
    if mode not in PLAYABLE_MODES:
        raise GameError("Neznan način igre.")
    if not is_mode_enabled(mode):
        raise GameError("Ta način igre trenutno ni na voljo.")
    friends_pick = int(site_get("ala_friends_pick"))
    difficulty_targets = list(site_get("ala_difficulty_targets"))
    ala_question_count = len(difficulty_targets)
    try:
        if mode == MODE_ALA_MILIJONAR:
            count = ala_question_count
            seconds = int(site_get("ala_time_seconds"))
        elif mode == MODE_DIRKA:
            count = 0
            default_dirka = int(site_get("dirka_time_seconds"))
            seconds = int(raw.get("time_limit_seconds") or default_dirka)
        elif mode == MODE_60_SEKUND:
            count = 0
            seconds = int(site_get("sixty_start_seconds"))
        else:
            seconds = int(raw.get("time_limit_seconds", 20))
            count = int(raw.get("question_count", 10))
    except (TypeError, ValueError):
        raise GameError("Število vprašanj in čas morata biti števili.")
    if mode == MODE_HITRARUNDA and not 5 <= count <= 100:
        raise GameError("Število vprašanj mora biti med 5 in 100.")
    mp_counts = get_int_set("mp_question_counts")
    if mode == MODE_MULTIPLAYER and count not in mp_counts:
        raise GameError("Število vprašanj ni med dovoljenimi.")
    if mode == MODE_MULTIPLAYER:
        if seconds not in get_int_set("mp_allowed_times"):
            raise GameError("Čas na vprašanje ni med dovoljenimi.")
    elif mode == MODE_DIRKA:
        if seconds not in get_int_set("dirka_allowed_times"):
            raise GameError("Čas na vprašanje ni med dovoljenimi.")
    elif mode not in {MODE_ALA_MILIJONAR, MODE_60_SEKUND} and seconds not in get_int_set("hr_allowed_times"):
        raise GameError("Čas na vprašanje ni med dovoljenimi.")
    slugs = raw.get("categories")
    if not isinstance(slugs, list) or not slugs:
        raise GameError("Izberi vsaj eno kategorijo.")
    cleaned = []
    for slug in slugs:
        if not isinstance(slug, str) or not slug.strip():
            raise GameError("Neznana kategorija.")
        value = slug.strip()
        if value not in cleaned:
            cleaned.append(value)
    known = set(Category.objects.filter(slug__in=cleaned, is_active=True).values_list("slug", flat=True))
    if set(cleaned) != known:
        raise GameError("Neznana kategorija.")
    pool = Question.objects.filter(category__slug__in=cleaned, is_active=True)
    if mode == MODE_ALA_MILIJONAR:
        pool = (
            pool.filter(question_type__in=ALA_QUESTION_TYPES)
            .annotate(option_count=Count("options"))
            .filter(option_count=ALA_OPTION_COUNT)
        )
    elif mode == MODE_60_SEKUND:
        pool = pool.filter(question_type__in=SIXTY_QUESTION_TYPES)
    available = pool.count()
    if mode in {MODE_DIRKA, MODE_60_SEKUND}:
        if available < 5:
            raise GameError(f"Na voljo je {available} vprašanj, potrebuješ vsaj 5.")
    elif available < count:
        raise GameError(f"Na voljo je {available} vprašanj, izbral si jih {count}.")

    friend_keys = []
    if mode == MODE_ALA_MILIJONAR:
        active = list(
            PhoneFriend.objects.filter(is_active=True).values_list("key", flat=True)
        )
        if len(active) < friends_pick:
            raise GameError(
                f"Za klic v sili potrebuješ {friends_pick} aktivnih prijateljev."
            )
        active_set = set(active)
        raw_friends = raw.get("friend_keys")
        if isinstance(raw_friends, list):
            for key in raw_friends:
                if not isinstance(key, str) or not key.strip():
                    continue
                value = key.strip()
                if value in active_set and value not in friend_keys:
                    friend_keys.append(value)
        if len(friend_keys) != friends_pick:
            friend_keys = random.sample(active, friends_pick)

    settings = {
        "mode": mode,
        "question_count": count,
        "categories": cleaned,
        "time_limit_seconds": seconds,
        "difficulty_progression": "ala_ladder" if mode == MODE_ALA_MILIJONAR else "increasing",
    }
    if friend_keys:
        settings["friend_keys"] = friend_keys
    if mode in LOBBY_MODES:
        try:
            bot_count = int(raw.get("bot_count") or 0)
        except (TypeError, ValueError):
            raise GameError("Število botov ni veljavno.")
        max_bots = int(site_get("mp_max_bots"))
        if not 0 <= bot_count <= max_bots:
            raise GameError(f"Število botov mora biti med 0 in {max_bots}.")
        settings["bot_count"] = bot_count
    if mode == MODE_MULTIPLAYER:
        settings["sudden_death"] = bool(raw.get("sudden_death"))
    if mode == MODE_DIRKA:
        try:
            target = int(raw.get("target_score") or 200)
        except (TypeError, ValueError):
            raise GameError("Cilj točk ni veljaven.")
        if target not in get_int_set("dirka_target_scores"):
            raise GameError("Cilj točk ni med dovoljenimi.")
        try:
            safe_every = int(raw.get("safe_every") or 5)
        except (TypeError, ValueError):
            raise GameError("Safe zone ni veljavna.")
        if safe_every not in get_int_set("dirka_safe_every"):
            raise GameError("Safe zone ni med dovoljenimi.")
        settings["target_score"] = target
        settings["safe_every"] = safe_every
        settings["question_count"] = 0
    if mode == MODE_60_SEKUND:
        raw_skip = raw.get("skip_limit", None)
        if raw_skip in ("", "unlimited", "neomejeno") or raw_skip is None:
            skip_limit = None
        else:
            try:
                skip_limit = int(raw_skip)
            except (TypeError, ValueError):
                raise GameError("Število preskokov ni veljavno.")
        if skip_limit not in get_skip_limits():
            raise GameError("Število preskokov ni med dovoljenimi.")
        profile = str(raw.get("difficulty_profile") or "normal").strip()
        if profile not in SIXTY_DIFFICULTY_PROFILES:
            raise GameError("Težavnostni profil je blago, normalno ali ostro.")
        settings["skip_limit"] = skip_limit
        settings["difficulty_profile"] = profile
        settings["time_limit_seconds"] = int(site_get("sixty_start_seconds"))
        settings["question_count"] = 0
    return settings


def room_name_for(mode):
    return MODE_LABELS.get(mode, "Hitra runda")


def select_questions(slugs, count, progression="increasing", question_types=None, option_count=None):
    # Najprej samo (id, difficulty) — ne naloži 10k+ objektov v Python.
    base = Question.objects.filter(category__slug__in=slugs, is_active=True)
    if question_types:
        base = base.filter(question_type__in=question_types)
    if option_count is not None:
        base = base.annotate(option_count=Count("options")).filter(option_count=option_count)
    rows = list(base.values_list("id", "difficulty"))
    if len(rows) < count:
        raise GameError(f"Na voljo je {len(rows)} vprašanj, izbral si jih {count}.")

    if progression == "random":
        chosen_ids = [row[0] for row in random.sample(rows, count)]
    else:
        buckets = {level: [] for level in range(1, 6)}
        for question_id, difficulty in rows:
            level = min(5, max(1, difficulty))
            buckets[level].append(question_id)
        for bucket in buckets.values():
            random.shuffle(bucket)

        if progression == "ala_ladder":
            targets = list(site_get("ala_difficulty_targets"))
            if count != len(targets):
                raise GameError(f"Ala milijonar potrebuje {len(targets)} vprašanj za težavnostni vzorec.")
        elif count == 1:
            targets = [3]
        else:
            targets = [min(5, max(1, round(1 + index * 4 / (count - 1)))) for index in range(count)]

        chosen_ids = []
        used = set()
        for target in targets:
            pick_id = _take_nearest_id(buckets, target, used)
            if pick_id is None:
                raise GameError("Ni dovolj vprašanj za izbrano težavnost.")
            chosen_ids.append(pick_id)
            used.add(pick_id)

    by_id = {
        question.id: question
        for question in Question.objects.filter(id__in=chosen_ids).select_related("category")
    }
    return [by_id[question_id] for question_id in chosen_ids if question_id in by_id]


def grade_answer(question, data, presentation=None):
    presentation = presentation or {}
    question_type = presentation.get("question_type") or question.question_type
    snap_options = presentation.get("options")
    if snap_options:
        options = snap_options
        option_id_of = lambda option: option["id"]
        is_correct_of = lambda option: bool(option.get("is_correct"))
        order_of = lambda option: (option.get("order", 0), option["id"])
    else:
        options = list(question.options.all())
        option_id_of = lambda option: option.id
        is_correct_of = lambda option: option.is_correct
        order_of = lambda option: (option.order, option.id)

    if question_type in SINGLE_TYPES:
        option_id = _as_int(data.get("option_id"))
        match = next((option for option in options if option_id_of(option) == option_id), None)
        if match is None:
            raise GameError("Neveljavna možnost.")
        return is_correct_of(match)
    if question_type == Question.Type.MULTI_SELECT:
        raw_ids = data.get("option_ids")
        if not isinstance(raw_ids, list):
            raise GameError("Izberi možnosti.")
        ids = []
        for raw in raw_ids:
            value = _as_int(raw)
            if value is None:
                raise GameError("Neveljavna možnost.")
            ids.append(value)
        known = {option_id_of(option) for option in options}
        if not set(ids) <= known:
            raise GameError("Neveljavna možnost.")
        correct = {option_id_of(option) for option in options if is_correct_of(option)}
        return set(ids) == correct
    if question_type == Question.Type.ORDERING:
        raw_ids = data.get("option_ids")
        if not isinstance(raw_ids, list):
            raise GameError("Razvrsti vse možnosti.")
        ids = [_as_int(raw) for raw in raw_ids]
        if any(value is None for value in ids):
            raise GameError("Neveljaven vrstni red.")
        correct_ids = [option_id_of(option) for option in sorted(options, key=order_of)]
        if sorted(ids) != sorted(correct_ids):
            raise GameError("Neveljaven vrstni red.")
        return ids == correct_ids
    if question_type == Question.Type.MATCHING:
        pairs = data.get("pairs")
        links = presentation.get("links") or []
        if not isinstance(pairs, list) or not links:
            raise GameError("Poveži vse pare.")
        expected = {link["left_id"]: link["right_id"] for link in links}
        known_rights = {link["right_id"] for link in links}
        got = {}
        for pair in pairs:
            if not isinstance(pair, dict):
                raise GameError("Neveljavni pari.")
            left_id = pair.get("left_id")
            right_id = pair.get("right_id")
            if left_id not in expected or right_id not in known_rights:
                raise GameError("Neveljavni pari.")
            got[left_id] = right_id
        if set(got) != set(expected):
            raise GameError("Poveži vse pare.")
        return got == expected
    if question_type == Question.Type.SLIDER:
        slider = presentation.get("slider") or {}
        config = presentation.get("config") or question.config or {}
        raw_value = data.get("value")
        if isinstance(raw_value, bool) or not isinstance(raw_value, (int, float)):
            raise GameError("Nastavi vrednost.")
        value = float(raw_value)
        minimum = float(slider.get("min", config["min"]))
        maximum = float(slider.get("max", config["max"]))
        correct = float(slider.get("correct", config["correct"]))
        tolerance = float(slider.get("tolerance", config["tolerance"]))
        if value < minimum or value > maximum:
            raise GameError("Vrednost je zunaj obsega.")
        return abs(value - correct) <= tolerance + 1e-9
    raise GameError("Neznan tip vprašanja.")


def member_id_for(user_id, code):
    member = (
        RoomMember.objects.filter(user_id=user_id, room__code=code, left_at__isnull=True)
        .order_by("-joined_at")
        .first()
    )
    return member.id if member else None


def require_can_advance(member, room, session=None):
    """Host lahko vedno nadaljuje (tudi bot-host, ko so ljudje odšli);
    če je host offline, lahko vsak povezan človek.

    Ko je načrtovan samodejni prehod že zapadel (`auto_advance_at`), sme nadaljevati
    kateri koli povezan človek — da se igra ne zatakne, če hostov WS odpade.
    """
    if member.left_at is not None:
        raise GameError("Samo gostitelj lahko nadaljuje.")
    if member.is_host:
        return
    if member.is_bot:
        raise GameError("Samo gostitelj lahko nadaljuje.")
    if session is not None:
        state = session.state or {}
        marker = str(state.get("auto_advance_for") or "")
        raw_at = state.get("auto_advance_at")
        if raw_at and (marker.startswith("next:") or marker.startswith("finish:")):
            from django.utils.dateparse import parse_datetime

            advance_at = raw_at if hasattr(raw_at, "isoformat") else parse_datetime(str(raw_at))
            if advance_at is not None:
                if timezone.is_naive(advance_at):
                    advance_at = timezone.make_aware(advance_at, timezone.get_current_timezone())
                if timezone.now() >= advance_at:
                    return
    host = room.members.filter(left_at__isnull=True, is_host=True).first()
    if host is not None and host.is_connected:
        raise GameError("Samo gostitelj lahko nadaljuje.")


def set_member_connected(member_id, connected, connection_epoch=None):
    """Mark presence. On connect bumps epoch and returns it; on disconnect only clears if epoch still matches."""
    from django.db.models import F

    if connected:
        RoomMember.objects.filter(pk=member_id).update(
            is_connected=True,
            connection_epoch=F("connection_epoch") + 1,
        )
        return RoomMember.objects.filter(pk=member_id).values_list("connection_epoch", flat=True).first()
    qs = RoomMember.objects.filter(pk=member_id)
    if connection_epoch is not None:
        qs = qs.filter(connection_epoch=connection_epoch)
    return qs.update(is_connected=False) > 0


def _room_mode(member_id):
    member = RoomMember.objects.select_related("room").filter(pk=member_id).first()
    if member is None:
        return None
    session = (
        GameSession.objects.filter(room_id=member.room_id, status__in=["preparing", "active"])
        .order_by("-created_at")
        .first()
    )
    if session is not None:
        return session.mode
    return (member.room.settings or {}).get("mode")


def snapshot(member_id):
    mode = _room_mode(member_id)
    if mode == MODE_MULTIPLAYER:
        from game.multiplayer import snapshot_multiplayer

        return snapshot_multiplayer(member_id)
    if mode == MODE_DIRKA:
        from game.dirka import snapshot_dirka

        return snapshot_dirka(member_id)
    if mode == MODE_60_SEKUND:
        from game.sixty import snapshot_sixty

        return snapshot_sixty(member_id)
    with transaction.atomic():
        member, _room, session = _lock(member_id)
        if session is None:
            return {"type": "game_state", "phase": "waiting"}
        if session.status == "active":
            _expire_if_due(member, _room, session)
            session.refresh_from_db()
        if session.status == "finished":
            return _finished_snapshot(member, session)
        game_question = _current(session)
        answer = _answer_for(game_question, member)
        if answer is None:
            return question_message(session, game_question, "game_state")
        return result_message(session, game_question, answer, member, "game_state")


def start_game(member_id):
    mode = _room_mode(member_id)
    if mode == MODE_MULTIPLAYER or mode == MODE_DIRKA:
        from game.lobby_countdown import begin_lobby_countdown

        # Najprej usklajen 3→2→1 za vse; commit po izteku v consumerju.
        return begin_lobby_countdown(member_id)
    if mode == MODE_60_SEKUND:
        from game.sixty import start_sixty

        return start_sixty(member_id)
    with transaction.atomic():
        member, room, session = _lock(member_id)
        if not member.is_host:
            raise GameError("Samo gostitelj lahko začne igro.")
        created = False
        if session is None:
            # Rematch ohrani končane seje; solo po finish → snapshot, ne nova igra.
            if room.status != "waiting":
                finished = (
                    GameSession.objects.filter(room=room, status="finished")
                    .order_by("-created_at")
                    .first()
                )
                if finished is not None:
                    return [_finished_snapshot(member, finished)]
                raise GameError("Igre ni mogoče začeti.")
            settings = room.settings or {}
            mode = settings.get("mode") or MODE_HITRARUNDA
            progression = settings.get("difficulty_progression") or (
                "ala_ladder" if mode == MODE_ALA_MILIJONAR else "increasing"
            )
            if mode == MODE_ALA_MILIJONAR:
                progression = "ala_ladder"
            questions = select_questions(
                settings.get("categories") or [],
                int(settings.get("question_count") or 10),
                progression,
                question_types=ALA_QUESTION_TYPES if mode == MODE_ALA_MILIJONAR else None,
                option_count=ALA_OPTION_COUNT if mode == MODE_ALA_MILIJONAR else None,
            )
            now = timezone.now()
            state = {
                "prize_ladder": ladder_for(len(questions)) if mode == MODE_ALA_MILIJONAR else [],
                "prize_reached": 0,
                "speed_bonus_total": 0,
                "correct_count": 0,
                "score": 0,
                "reason": "",
                "active_helps": {},
            }
            if mode == MODE_ALA_MILIJONAR:
                friend_keys = [
                    str(k).strip()
                    for k in (settings.get("friend_keys") or [])
                    if str(k).strip()
                ]
                pick = int(site_get("ala_friends_pick"))
                if len(friend_keys) < pick:
                    active = list(
                        PhoneFriend.objects.filter(is_active=True).values_list("key", flat=True)
                    )
                    if len(active) < pick:
                        raise GameError(
                            f"Za klic v sili potrebuješ {pick} aktivnih prijateljev."
                        )
                    friend_keys = random.sample(active, pick)
                    settings = {**settings, "friend_keys": friend_keys}
                    room.settings = settings
                    room.save(update_fields=["settings"])
                state["lifelines"] = initial_lifeline_state(friend_keys)
            session = GameSession.objects.create(
                room=room,
                mode=mode,
                status="active",
                total_questions=len(questions),
                current_question_index=0,
                time_limit_seconds=int(settings.get("time_limit_seconds") or 20),
                state=state,
                started_at=now,
            )
            for index, question in enumerate(questions):
                GameQuestion.objects.create(
                    game_session=session,
                    question=question,
                    order=index,
                    started_at=now if index == 0 else None,
                )
            room.status = "playing"
            room.started_at = now
            room.save(update_fields=["status", "started_at"])
            created = True
        elif session.status == "active":
            _expire_if_due(member, room, session)
            session.refresh_from_db()
        if session.status == "finished":
            return [_finished_snapshot(member, session)]
        game_question = _current(session)
        answer = _answer_for(game_question, member)
        if answer is not None:
            return [result_message(session, game_question, answer, member, "game_state")]
        return [question_message(session, game_question, "game_started" if created else "game_state")]


def submit_answer(member_id, message):
    if not isinstance(message, dict):
        raise GameError("Neveljavno sporočilo.")
    mode = _room_mode(member_id)
    if mode == MODE_MULTIPLAYER:
        from game.multiplayer import submit_multiplayer

        return submit_multiplayer(member_id, message)
    if mode == MODE_DIRKA:
        from game.dirka import submit_dirka

        return submit_dirka(member_id, message)
    if mode == MODE_60_SEKUND:
        from game.sixty import submit_sixty

        return submit_sixty(member_id, message)
    with transaction.atomic():
        member, room, session = _lock(member_id)
        if session is None or session.status != "active":
            if session is not None and session.status == "finished":
                return [_finished_snapshot(member, session)]
            raise GameError("Igra ni aktivna.")
        game_question = _current(session)
        if str(message.get("game_question_id")) != str(game_question.id):
            raise GameError("To vprašanje ni aktivno.")
        existing = _answer_for(game_question, member)
        if existing is not None:
            result = result_message(session, game_question, existing, member)
            return (
                [result, _finished_copy(result, session, member)]
                if session.status == "finished"
                else [result]
            )
        return _grade_locked(member, room, session, game_question, message)


def apply_timeout(member_id, game_question_id):
    mode = _room_mode(member_id)
    if mode == MODE_MULTIPLAYER:
        from game.multiplayer import apply_multiplayer_timeout

        return apply_multiplayer_timeout(member_id, game_question_id)
    if mode == MODE_DIRKA:
        from game.dirka import apply_dirka_timeout

        return apply_dirka_timeout(member_id, game_question_id)
    if mode == MODE_60_SEKUND:
        from game.sixty import apply_sixty_timeout

        return apply_sixty_timeout(member_id, game_question_id)
    with transaction.atomic():
        member, room, session = _lock(member_id)
        if session is None or session.status != "active":
            return []
        game_question = _current(session)
        if str(game_question.id) != str(game_question_id):
            return []
        if _answer_for(game_question, member) is not None:
            return []
        if game_question.started_at is None or timezone.now() <= hard_end(game_question, session):
            return []
        return _grade_locked(
            member,
            room,
            session,
            game_question,
            {"timeout": True, "game_question_id": str(game_question.id)},
        )


def seconds_until_hard_end(game_question_id):
    try:
        game_question = GameQuestion.objects.select_related("game_session", "game_session__room").get(
            pk=game_question_id
        )
    except GameQuestion.DoesNotExist:
        return None
    session = game_question.game_session
    if session.status != "active" or game_question.order != session.current_question_index:
        return None
    if game_question.started_at is None:
        return None
    if session.mode == MODE_DIRKA:
        from game.dirka import seconds_until_dirka_deadline

        return seconds_until_dirka_deadline(game_question_id)
    if session.mode == MODE_60_SEKUND:
        from game.sixty import seconds_until_sixty_deadline

        return seconds_until_sixty_deadline(game_question_id)
    if session.mode == MODE_MULTIPLAYER:
        active = session.room.members.filter(left_at__isnull=True).count()
        if active > 0 and game_question.answers.count() >= active:
            return None
    elif game_question.answers.exists():
        return None
    remaining = (hard_end(game_question, session) - timezone.now()).total_seconds()
    return max(0.0, remaining)


def next_question(member_id):
    mode = _room_mode(member_id)
    if mode == MODE_MULTIPLAYER:
        from game.multiplayer import next_multiplayer

        return next_multiplayer(member_id)
    if mode == MODE_DIRKA:
        from game.dirka import next_dirka

        return next_dirka(member_id)
    with transaction.atomic():
        member, _room, session = _lock(member_id)
        if session is None:
            raise GameError("Igra še ni začeta.")
        if session.status == "finished":
            return [_finished_snapshot(member, session)]
        if session.status != "active":
            raise GameError("Igra ni aktivna.")
        game_question = _current(session)
        answer = _answer_for(game_question, member)
        if answer is None:
            return [question_message(session, game_question, "question")]
        if not answer.is_correct:
            raise GameError("Igra je končana.")
        if game_question.order + 1 >= session.total_questions:
            raise GameError("Ni naslednjega vprašanja.")
        nxt = (
            session.game_questions.select_related("question__category")
            .prefetch_related("question__options")
            .get(order=game_question.order + 1)
        )
        if nxt.started_at is None:
            nxt.started_at = timezone.now()
            nxt.save(update_fields=["started_at"])
        state = dict(session.state or {})
        state["active_helps"] = {}
        session.state = state
        update_fields = ["state"]
        if session.current_question_index != nxt.order:
            session.current_question_index = nxt.order
            update_fields.append("current_question_index")
        session.save(update_fields=update_fields)
        return [question_message(session, nxt, "question")]


def use_bonus(member_id, message):
    if _room_mode(member_id) == MODE_DIRKA:
        from game.dirka import use_dirka_bonus

        return use_dirka_bonus(member_id, message)
    return use_lifeline(member_id, message)


def use_lifeline(member_id, message):
    if not isinstance(message, dict):
        raise GameError("Neveljavno sporočilo.")
    effect = str(message.get("effect") or "").strip()
    with transaction.atomic():
        member, _room, session = _lock(member_id)
        if session is None or session.status != "active":
            raise GameError("Igra ni aktivna.")
        if session.mode != MODE_ALA_MILIJONAR:
            raise GameError("Bonusi so na voljo samo v Ala milijonar.")
        game_question = _current(session)
        if _answer_for(game_question, member) is not None:
            raise GameError("Odgovor je že oddan.")
        if str(message.get("game_question_id")) != str(game_question.id):
            raise GameError("To vprašanje ni aktivno.")
        state = dict(session.state or {})
        lifelines = state.get("lifelines") or {}
        slot = lifelines.get(effect) or {}
        if not slot.get("available") or slot.get("used"):
            raise GameError("Ta bonus je že porabljen.")
        bonus = BonusDefinition.objects.filter(effect_key=effect, is_active=True).first()
        if bonus is None or MODE_ALA_MILIJONAR not in (bonus.modes or []):
            raise GameError("Neznan bonus.")
        allowed_types = (bonus.config or {}).get("applies_to_types") or []
        if allowed_types and game_question.question.question_type not in allowed_types:
            raise GameError("Ta bonus tu ni na voljo.")

        if effect == "fifty_fifty":
            result = apply_fifty_fifty(game_question, state)
        elif effect == "audience":
            result = apply_audience(game_question, state)
        elif effect == "phone_friend":
            friend_key = str(message.get("friend_key") or "").strip()
            if not friend_key:
                raise GameError("Izberi prijatelja.")
            result = apply_phone_friend(game_question, state, friend_key)
        else:
            raise GameError("Neznan bonus.")

        mark_lifeline_used(state, effect)
        session.state = state
        session.save(update_fields=["state"])
        payload = question_message(session, game_question, "lifeline_result")
        payload["lifeline"] = result
        return [payload]


def walk_away(member_id):
    with transaction.atomic():
        member, room, session = _lock(member_id)
        if session is None or session.status != "active":
            raise GameError("Igra ni aktivna.")
        if session.mode != MODE_ALA_MILIJONAR:
            raise GameError("Odnehaj je na voljo samo v Ala milijonar.")
        game_question = _current(session)
        if _answer_for(game_question, member) is not None:
            raise GameError("Odgovor je že oddan.")
        state = dict(session.state or {})
        if int(state.get("prize_reached") or 0) <= 0:
            raise GameError("Še nimaš nagrade za odnehaj.")
        now = timezone.now()
        answer = PlayerAnswer.objects.create(
            game_question=game_question,
            room_member=member,
            answer_data={"walk_away": True},
            is_correct=None,
            answered_at=now,
            time_taken_ms=max(0, int((now - game_question.started_at).total_seconds() * 1000))
            if game_question.started_at
            else 0,
            points=0,
        )
        game_question.ended_at = now
        game_question.save(update_fields=["ended_at"])
        state["reason"] = "walk_away"
        state["score"] = int(state.get("prize_reached") or 0) + int(state.get("speed_bonus_total") or 0)
        session.state = state
        _finalize(session, room, member, "walk_away", now)
        result = result_message(session, game_question, answer, member)
        return [result, _finished_copy(result, session, member)]


def guaranteed_prize(correct_count, ladder):
    guaranteed = 0
    for order in site_get("ala_safe_orders"):
        if correct_count > order and order < len(ladder):
            guaranteed = ladder[order]
    return guaranteed


def question_message(session, game_question, message_type):
    state = _state(session)
    ladder = state["prize_ladder"]
    index = game_question.order
    can_walk = (
        session.mode == MODE_ALA_MILIJONAR
        and session.status == "active"
        and int(state.get("prize_reached") or 0) > 0
    )
    return {
        "type": message_type,
        "phase": "question",
        "mode": session.mode,
        "question": public_question(game_question),
        "index": index,
        "total": session.total_questions,
        "prize_ladder": ladder,
        "safe_orders": list(site_get("ala_safe_orders")) if session.mode == MODE_ALA_MILIJONAR else [],
        "guaranteed_prize": guaranteed_prize(state["correct_count"], ladder)
        if session.mode == MODE_ALA_MILIJONAR
        else 0,
        "can_walk_away": can_walk,
        "prize_reached": state["prize_reached"],
        "stake": ladder[index] if index < len(ladder) else None,
        "next_stake": ladder[index + 1] if index + 1 < len(ladder) else None,
        "score": state["score"],
        "speed_bonus_total": state["speed_bonus_total"],
        "correct_count": state["correct_count"],
        "deadline_at": official_end(game_question, session).isoformat(),
        "server_now": timezone.now().isoformat(),
        "time_limit_seconds": session.time_limit_seconds,
        "lifelines": state.get("lifelines") or {},
        "active_helps": state.get("active_helps") or {},
        "friends": state.get("friends") or [],
    }


def result_message(session, game_question, answer, member, message_type="answer_result"):
    state = _state(session)
    finished = session.status == "finished"
    index = game_question.order
    ladder = state["prize_ladder"]
    body = {
        "type": message_type,
        "phase": "finished" if finished else "review",
        "question": public_question(game_question),
        "index": index,
        "total": session.total_questions,
        "total_questions": session.total_questions,
        "is_correct": None if answer.is_correct is None else bool(answer.is_correct),
        "timed_out": bool((answer.answer_data or {}).get("timeout")),
        "walked_away": bool((answer.answer_data or {}).get("walk_away")),
        "explanation": game_question.question.explanation,
        "finished": finished,
        "reason": state["reason"],
        "speed_bonus": answer.points,
        "speed_bonus_total": state["speed_bonus_total"],
        "prize_reached": state["prize_reached"],
        "score": state["score"],
        "correct_count": state["correct_count"],
        "prize_ladder": ladder,
        "stake": ladder[index] if index < len(ladder) else None,
        "next_stake": None if finished or index + 1 >= len(ladder) else ladder[index + 1],
        "nickname": member.nickname_in_room,
        "server_now": timezone.now().isoformat(),
        "safe_orders": list(site_get("ala_safe_orders")) if session.mode == MODE_ALA_MILIJONAR else [],
        "guaranteed_prize": guaranteed_prize(state["correct_count"], ladder)
        if session.mode == MODE_ALA_MILIJONAR
        else 0,
        "mode": session.mode,
        "lifelines": state.get("lifelines") or {},
        "friends": state.get("friends") or [],
    }
    body.update(_reveal(game_question))
    body.update(_selected(answer))
    return body


def _grade_locked(member, room, session, game_question, message):
    now = timezone.now()
    if game_question.started_at is None:
        raise GameError("Vprašanje še ni začeto.")
    official = official_end(game_question, session)
    hard = hard_end(game_question, session)
    wants_timeout = bool(message.get("timeout"))
    if wants_timeout and now < official:
        return []
    timed_out = wants_timeout or now > hard
    if timed_out:
        is_correct = False
        answer_data = {"timeout": True}
        selected = None
    else:
        presentation = ensure_presentation(game_question)
        is_correct = grade_answer(game_question.question, message, presentation)
        answer_data = _stored_answer(message)
        selected = _selected_option(game_question, message)
    elapsed = max(0, int((now - game_question.started_at).total_seconds() * 1000))
    bonus = speed_bonus(elapsed, session.time_limit_seconds) if is_correct else 0
    answer = PlayerAnswer.objects.create(
        game_question=game_question,
        room_member=member,
        selected_option=selected,
        answer_data=answer_data,
        is_correct=is_correct,
        answered_at=now,
        time_taken_ms=elapsed,
        points=bonus,
    )
    game_question.ended_at = now
    game_question.save(update_fields=["ended_at"])
    state = dict(session.state or {})
    ladder = state.get("prize_ladder") or (
        ladder_for(session.total_questions) if session.mode == MODE_ALA_MILIJONAR else []
    )
    if is_correct:
        state["correct_count"] = state.get("correct_count", 0) + 1
        if session.mode == MODE_HITRARUNDA:
            base_pts = int(site_get("hr_base_points"))
            state["prize_reached"] = int(state.get("prize_reached") or 0) + base_pts
            state["speed_bonus_total"] = int(state.get("speed_bonus_total") or 0) + bonus
            state["score"] = int(state["prize_reached"]) + int(state["speed_bonus_total"])
        else:
            state["prize_reached"] = ladder[state["correct_count"] - 1]
            state["speed_bonus_total"] = state.get("speed_bonus_total", 0) + bonus
            state["score"] = state["prize_reached"] + state["speed_bonus_total"]
    elif session.mode == MODE_ALA_MILIJONAR:
        # Varne točke: napačen/timeout pusti zagotovljeno nagrado.
        guaranteed = guaranteed_prize(int(state.get("correct_count") or 0), ladder)
        state["prize_reached"] = guaranteed
        state["score"] = guaranteed + int(state.get("speed_bonus_total") or 0)
    is_last = game_question.order + 1 >= session.total_questions
    should_finish = timed_out or (not is_correct) or is_last
    if should_finish:
        if timed_out:
            reason = "timeout"
        elif not is_correct:
            reason = "wrong"
        else:
            reason = "completed"
        state["reason"] = reason
        session.state = state
        _finalize(session, room, member, reason, now)
    else:
        session.state = state
        session.save(update_fields=["state"])
    result = result_message(session, game_question, answer, member)
    if should_finish:
        return [result, _finished_copy(result, session, member)]
    return [result]


def _expire_if_due(member, room, session):
    if session.status != "active":
        return
    game_question = _current(session)
    if _answer_for(game_question, member) is not None or game_question.started_at is None:
        return
    if timezone.now() <= hard_end(game_question, session):
        return
    _grade_locked(
        member,
        room,
        session,
        game_question,
        {"timeout": True, "game_question_id": str(game_question.id)},
    )


def _finalize(session, room, member, reason, now):
    session.status = "finished"
    session.finished_at = now
    state = dict(session.state or {})
    state["reason"] = reason
    session.state = state
    session.save(update_fields=["status", "finished_at", "state"])
    room.status = "finished"
    room.finished_at = now
    room.save(update_fields=["status", "finished_at"])
    duration = None
    if session.started_at:
        duration = max(0, int((now - session.started_at).total_seconds() * 1000))
    GameResult.objects.get_or_create(
        game_session=session,
        defaults={
            "user": member.user,
            "nickname": member.nickname_in_room,
            "mode": session.mode,
            "score": state.get("score", 0),
            "prize_reached": state.get("prize_reached", 0),
            "speed_bonus": state.get("speed_bonus_total", 0),
            "correct_count": state.get("correct_count", 0),
            "total_questions": session.total_questions,
            "duration_ms": duration,
            "is_guest": member.user.is_guest,
            "reason": reason,
            "room_code": room.code,
        },
    )


def _finished_snapshot(member, session):
    answer = (
        PlayerAnswer.objects.filter(game_question__game_session=session, room_member=member)
        .select_related("game_question__question__category")
        .prefetch_related("game_question__question__options")
        .order_by("-game_question__order")
        .first()
    )
    if answer is None:
        state = _state(session)
        payload = {
            "type": "game_finished",
            "phase": "finished",
            "finished": True,
            "reason": state["reason"],
            "score": state["score"],
            "prize_reached": state["prize_reached"],
            "speed_bonus_total": state["speed_bonus_total"],
            "correct_count": state["correct_count"],
            "total": session.total_questions,
            "total_questions": session.total_questions,
            "nickname": member.nickname_in_room,
            "prize_ladder": state["prize_ladder"],
        }
        return _attach_result_id(payload, session, member)
    return _finished_copy(result_message(session, answer.game_question, answer, member), session, member)


def _finished_copy(result, session=None, member=None):
    payload = dict(result)
    payload["type"] = "game_finished"
    payload["phase"] = "finished"
    payload["finished"] = True
    payload["total_questions"] = result.get("total")
    if session is not None:
        _attach_result_id(payload, session, member)
    return payload


def _attach_result_id(payload, session, member=None):
    from game.replay import result_id_for

    rid = result_id_for(session, member=member)
    if rid:
        payload["result_id"] = rid
    return payload


def _lock(member_id):
    try:
        member = RoomMember.objects.select_related("user").get(pk=member_id)
    except RoomMember.DoesNotExist:
        raise GameError("Soba ne obstaja.")
    room = Room.objects.select_for_update().get(pk=member.room_id)
    # Samo živa seja — končane ostanejo za rematch/replay; sicer start ustvari novo.
    session = (
        GameSession.objects.select_for_update()
        .filter(room=room, status__in=["preparing", "active"])
        .order_by("-created_at")
        .first()
    )
    return member, room, session


def _current(session):
    return (
        session.game_questions.select_related("question__category")
        .prefetch_related("question__options")
        .get(order=session.current_question_index)
    )


def _answer_for(game_question, member):
    return PlayerAnswer.objects.filter(game_question=game_question, room_member=member).first()


def _state(session):
    state = session.state or {}
    if "prize_ladder" in state:
        ladder = list(state.get("prize_ladder") or [])
    elif session.mode == MODE_ALA_MILIJONAR:
        ladder = ladder_for(session.total_questions)
    else:
        ladder = []
    friends = []
    friend_keys = (state.get("lifelines") or {}).get("phone_friend", {}).get("friend_keys") or []
    if friend_keys:
        by_key = {
            friend.key: friend
            for friend in PhoneFriend.objects.filter(key__in=friend_keys)
        }
        for key in friend_keys:
            friend = by_key.get(key)
            if friend:
                friends.append(
                    {
                        "key": friend.key,
                        "name": friend.name,
                        "title": friend.title,
                        "bio": friend.bio,
                        "specialty_categories": friend.specialty_categories,
                        "avatar_color": friend.avatar_color,
                        "avatar": resolve_avatar_key(
                            avatar=friend.avatar or "",
                            nickname=friend.name,
                            seed=friend.key,
                        ),
                        "used": key in ((state.get("lifelines") or {}).get("phone_friend", {}).get("used_friends") or []),
                    }
                )
    return {
        "prize_ladder": ladder,
        "prize_reached": state.get("prize_reached", 0),
        "speed_bonus_total": state.get("speed_bonus_total", 0),
        "correct_count": state.get("correct_count", 0),
        "score": state.get("score", 0),
        "reason": state.get("reason") or "",
        "lifelines": state.get("lifelines") or {},
        "active_helps": state.get("active_helps") or {},
        "friends": friends,
    }


def _reveal(game_question):
    from game.presentation import ensure_presentation

    presentation = ensure_presentation(game_question)
    question_type = presentation.get("question_type") or game_question.question.question_type
    snap_options = presentation.get("options") or []
    if question_type in {
        Question.Type.MULTIPLE_CHOICE,
        Question.Type.TRUE_FALSE,
        Question.Type.MULTI_SELECT,
    }:
        if snap_options:
            return {
                "correct_option_ids": [option["id"] for option in snap_options if option.get("is_correct")]
            }
        return {"correct_option_ids": [option.id for option in game_question.question.options.all() if option.is_correct]}
    if question_type == Question.Type.ORDERING:
        if snap_options:
            ordered = sorted(snap_options, key=lambda option: (option.get("order", 0), option["id"]))
            return {"correct_option_ids": [option["id"] for option in ordered]}
        ordered = sorted(game_question.question.options.all(), key=lambda option: (option.order, option.id))
        return {"correct_option_ids": [option.id for option in ordered]}
    if question_type == Question.Type.MATCHING:
        return {
            "correct_pairs": [
                {
                    "left_id": link["left_id"],
                    "right_id": link["right_id"],
                    "left": link["left"],
                    "right": link["right"],
                }
                for link in presentation.get("links", [])
            ]
        }
    if question_type == Question.Type.SLIDER:
        slider = presentation.get("slider") or {}
        config = presentation.get("config") or game_question.question.config or {}
        return {
            "correct_value": slider.get("correct", config.get("correct")),
            "tolerance": slider.get("tolerance", config.get("tolerance")),
        }
    return {}


def _selected(answer):
    data = answer.answer_data or {}
    selected = {}
    if data.get("option_id") is not None:
        selected["selected_option_ids"] = [data["option_id"]]
    elif data.get("option_ids") is not None:
        selected["selected_option_ids"] = data["option_ids"]
    if data.get("pairs") is not None:
        selected["selected_pairs"] = data["pairs"]
    if data.get("value") is not None:
        selected["selected_value"] = data["value"]
    return selected


def _stored_answer(message):
    stored = {}
    if "option_id" in message:
        stored["option_id"] = _as_int(message.get("option_id"))
    if "option_ids" in message:
        stored["option_ids"] = message.get("option_ids")
    if "pairs" in message:
        stored["pairs"] = message.get("pairs")
    if "value" in message:
        stored["value"] = message.get("value")
    return stored


def _selected_option(game_question, message):
    if game_question.question.question_type not in SINGLE_TYPES:
        return None
    option_id = _as_int(message.get("option_id"))
    if option_id is None:
        return None
    return game_question.question.options.filter(pk=option_id).first()


def _take_nearest(buckets, target, used):
    order = [target]
    for delta in range(1, 5):
        order.append(target - delta)
        order.append(target + delta)
    for level in order:
        if level < 1 or level > 5:
            continue
        for question in buckets[level]:
            if question.id not in used:
                return question
    return None


def _take_nearest_id(buckets, target, used):
    """Isto kot _take_nearest, a bucketi vsebujejo samo ID-je."""
    order = [target]
    for delta in range(1, 5):
        order.append(target - delta)
        order.append(target + delta)
    for level in order:
        if level < 1 or level > 5:
            continue
        for question_id in buckets[level]:
            if question_id not in used:
                return question_id
    return None


def _as_int(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return None
