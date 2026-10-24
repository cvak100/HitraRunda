"""Dirka: sinhrona multiplayer dirka do ciljnih točk z fiksnimi bonusi."""

from __future__ import annotations

import random
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from game.engine import (
    GameError,
    _answer_for,
    _current,
    _lock,
    _reveal,
    _selected,
    _selected_option,
    _stored_answer,
    grade_answer,
    official_end,
    question_message,
    require_can_advance,
    select_questions,
)
from game.modes import (
    DIRKA_ACTIVE_BONUSES,
    DIRKA_BOT_KEY,
    DIRKA_CLEAN_SHEET,
    DIRKA_EXTRA_TIME,
    DIRKA_MAX_SPEED_BONUS,
    DIRKA_QUESTION_POOL,
    DIRKA_ROUND_ADVANCE_SECONDS,
    DIRKA_RUSH_CAP,
    DIRKA_SAFE_REWARD,
    DIRKA_BREAKTHROUGH_RATIO,
    DIRKA_CONVERT_STACK,
    DIRKA_SHIELD_ROUNDS,
    DIRKA_STRONG_BONUSES,
    DIRKA_WEAK_BONUSES,
    MODE_DIRKA,
    MP_MIN_PLAYERS,
)
from accounts.nicknames import avatar_for_member, resolve_avatar_key
from game.models import GameQuestion, GameResult, GameSession, PlayerAnswer
from game.multiplayer import _bot_answer_message
from game.site_settings import get as site_get
from game.presentation import ensure_presentation, public_question
from questions.models import Question
from rooms.services import lobby_payload, refresh_can_start

SINGLE_TYPES = {Question.Type.MULTIPLE_CHOICE, Question.Type.TRUE_FALSE}


def _time_limit(session) -> int:
    """Sekunde na vprašanje — iz sobe/seje, sicer site default."""
    value = int(getattr(session, "time_limit_seconds", 0) or 0)
    if value > 0:
        return value
    return int(site_get("dirka_time_seconds"))


def snapshot_dirka(member_id):
    with transaction.atomic():
        member, room, session = _lock(member_id)
        if session is None:
            return lobby_event(room, member.user, "lobby")
        if session.status == "finished":
            return finished_dirka(session, member)
        game_question = _current(session)
        if _round_complete(session, game_question):
            return round_review_message(session, game_question, member, "game_state")
        answer = _answer_for(game_question, member)
        if answer is None:
            return question_payload(session, game_question, member, "game_state")
        return waiting_answers_message(session, game_question, member, "game_state")


def lobby_event(room, viewer, message_type="lobby"):
    payload = refresh_can_start(lobby_payload(room, viewer=viewer))
    payload["type"] = message_type
    payload["phase"] = "lobby"
    payload["mode"] = MODE_DIRKA
    return payload


def _initial_bonuses():
    """Na startu ni bonusov — pridejo med igro (streak / safe / drop)."""
    return {}


def _held_bonus_types(bonuses):
    return [key for key, count in (bonuses or {}).items() if int(count or 0) > 0]


def _grant_bonus(stats, effect, amount=1):
    """
    Doda charge. Isti tip se stacka.
    Največ int(site_get("dirka_max_bonus_types")) različnih tipov; če bi bil nov 6., ne doda.
    Ob DIRKA_CONVERT_STACK enakih: zbriše stack in da 1 naključni močan.
    """
    if effect not in DIRKA_ACTIVE_BONUSES or amount <= 0:
        return None
    bonuses = dict(stats.get("bonuses") or {})
    held = _held_bonus_types(bonuses)
    if effect not in held and len(held) >= int(site_get("dirka_max_bonus_types")):
        return None
    new_count = int(bonuses.get(effect) or 0) + int(amount)
    bonuses[effect] = new_count
    stats["bonuses"] = bonuses
    if new_count < DIRKA_CONVERT_STACK:
        return effect
    # 3 + 1 (ali več) → pretvori v močan.
    cleared = new_count
    bonuses.pop(effect, None)
    stats["bonuses"] = bonuses
    converted_to = _grant_random_bonus(stats, DIRKA_STRONG_BONUSES)
    if converted_to is None:
        bonuses[effect] = cleared
        stats["bonuses"] = bonuses
        return effect
    pending = stats.setdefault("_pending_converts", [])
    pending.append({"from": effect, "cleared": cleared, "to": converted_to})
    return converted_to


def _grant_random_bonus(stats, pool):
    held = set(_held_bonus_types(stats.get("bonuses") or {}))
    if len(held) >= int(site_get("dirka_max_bonus_types")):
        # Samo stack obstoječih tipov.
        candidates = [key for key in pool if key in held]
    else:
        candidates = list(pool)
    if not candidates:
        return None
    return _grant_bonus(stats, random.choice(candidates))


def _flush_pending_converts(stats, answer_data, bonuses_gained):
    """Prenesi convert log iz stats v answer_data (in seznam gained)."""
    pending = list(stats.pop("_pending_converts", None) or [])
    if not pending:
        return
    answer_data["bonus_converts"] = pending
    answer_data["bonus_convert"] = pending[-1]
    for item in pending:
        to = item.get("to")
        if to and to not in bonuses_gained:
            bonuses_gained.append(to)


def start_dirka(member_id):
    with transaction.atomic():
        member, room, session = _lock(member_id)
        if not member.is_host:
            raise GameError("Samo gostitelj lahko začne igro.")
        if session is not None:
            return [snapshot_dirka(member_id)]
        if room.status != "waiting":
            raise GameError("Igre ni mogoče začeti.")
        members = list(room.members.filter(left_at__isnull=True).select_related("user"))
        if len(members) < MP_MIN_PLAYERS:
            raise GameError(f"Potrebujeta vsaj {MP_MIN_PLAYERS} igralca.")
        if not all(item.is_ready or item.is_bot for item in members):
            raise GameError("Vsi igralci morajo biti pripravljeni.")
        settings = room.settings or {}
        target = int(settings.get("target_score") or 200)
        safe_every = int(settings.get("safe_every") or 5)
        time_limit = int(settings.get("time_limit_seconds") or site_get("dirka_time_seconds"))
        pool_size = min(DIRKA_QUESTION_POOL, _available_count(settings))
        if pool_size < 5:
            raise GameError("Premalo vprašanj v izbranih kategorijah.")
        questions = select_questions(
            settings.get("categories") or [],
            pool_size,
            settings.get("difficulty_progression") or "increasing",
        )
        now = timezone.now()
        players = {}
        for item in members:
            players[str(item.id)] = {
                "nickname": item.nickname_in_room,
                "color": item.color,
                "avatar": avatar_for_member(item),
                "score": 0,
                "safe_locked": 0,
                "correct_count": 0,
                "correct_in_segment": 0,
                "segment_misses": 0,
                "streak": 0,
                "speed_bonus_total": 0,
                "penalty_total": 0,
                "is_bot": item.is_bot,
                "bonuses": _initial_bonuses(),
                "armed": {},
                "shield": False,
                "shield_left": 0,
                "second_chance": False,
                "blocked": False,
                "comeback_armed": False,
                "breakthrough_claimed": False,
                "active_helps": {},
            }
        session = GameSession.objects.create(
            room=room,
            mode=MODE_DIRKA,
            status="active",
            total_questions=len(questions),
            current_question_index=0,
            time_limit_seconds=time_limit,
            state={
                "players": players,
                "reason": "",
                "target_score": target,
                "safe_every": safe_every,
                "deadlines": {},
                "bots_scheduled_for": None,
                "auto_advance_for": None,
                "used_question_ids": [q.id for q in questions],
            },
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
        room.last_activity = now
        room.save(update_fields=["status", "started_at", "last_activity"])
        game_question = _current(session)
        _reset_round_state(session, game_question, now)
        return [question_payload(session, game_question, members[0], "game_started")]


def _available_count(settings):
    slugs = settings.get("categories") or []
    return Question.objects.filter(category__slug__in=slugs, is_active=True).count()


def _reset_round_state(session, game_question, now=None, *, tick_shield=False):
    now = now or timezone.now()
    state = dict(session.state or {})
    players = dict(state.get("players") or {})
    deadlines = {}
    deadline = now + timedelta(seconds=_time_limit(session))
    for key, stats in players.items():
        stats = dict(stats)
        stats["active_helps"] = {}
        stats["second_chance"] = False
        # Ščit traja DIRKA_SHIELD_ROUNDS rund — tick ob prehodu na naslednje vprašanje.
        if tick_shield:
            left = int(stats.get("shield_left") or 0)
            if left > 0:
                left -= 1
                stats["shield_left"] = left
                stats["shield"] = left > 0
            elif stats.get("shield"):
                stats["shield"] = False
                stats["shield_left"] = 0
        # Block applies to this round if armed from previous.
        if stats.get("block_pending"):
            stats["blocked"] = True
            stats["block_pending"] = False
        else:
            stats["blocked"] = False
        players[key] = stats
        deadlines[key] = deadline.isoformat()
    state["players"] = players
    state["deadlines"] = deadlines
    state["bots_scheduled_for"] = None
    state["auto_advance_for"] = None
    session.state = state
    session.save(update_fields=["state"])


def submit_dirka(member_id, message):
    if not isinstance(message, dict):
        raise GameError("Neveljavno sporočilo.")
    with transaction.atomic():
        member, room, session = _lock(member_id)
        if session is None or session.status != "active" or session.mode != MODE_DIRKA:
            raise GameError("Igra ni aktivna.")
        game_question = _current(session)
        if str(message.get("game_question_id")) != str(game_question.id):
            raise GameError("To vprašanje ni aktivno.")
        existing = _answer_for(game_question, member)
        if existing is not None:
            if _round_complete(session, game_question):
                return broadcast_round_review(session, game_question)
            return [waiting_answers_message(session, game_question, member)]
        if bool(message.get("skip")):
            _store_skip(member, session, game_question)
        else:
            result = _store_answer(member, session, game_question, message)
            if result == "second_chance":
                return [question_payload(session, game_question, member, "question")]
        if _round_complete(session, game_question) or _all_deadlines_passed(session, game_question):
            _apply_timeouts(session, game_question)
            winner = _check_winner(session)
            if winner is not None:
                return finalize_dirka(session, room, reason="race_won")
            return broadcast_round_review(session, game_question)
        return [waiting_answers_message(session, game_question, member)]


def apply_dirka_timeout(member_id, game_question_id):
    with transaction.atomic():
        member, room, session = _lock(member_id)
        if session is None or session.status != "active" or session.mode != MODE_DIRKA:
            return []
        game_question = _current(session)
        if str(game_question.id) != str(game_question_id):
            return []
        _apply_personal_timeouts(session, game_question)
        if not _round_complete(session, game_question) and not _all_deadlines_passed(session, game_question):
            return [waiting_answers_message(session, game_question, member)]
        _apply_timeouts(session, game_question)
        if _check_winner(session) is not None:
            return finalize_dirka(session, room, reason="race_won")
        return broadcast_round_review(session, game_question)


def next_dirka(member_id):
    with transaction.atomic():
        member, room, session = _lock(member_id)
        if session is None or session.mode != MODE_DIRKA:
            raise GameError("Igra ni aktivna.")
        if session.status == "finished":
            return [finished_dirka(session, member)]
        game_question = _current(session)
        state = dict(session.state or {})
        # Prehod je že narejen — vrni trenutno vprašanje za resync (klient je morda
        # zgrešil prvi broadcast). Frontend dedupe-a SFX "next" po question id.
        if str(state.get("auto_advance_for") or "").startswith("done:") and not _round_complete(
            session, game_question
        ):
            return [question_payload(session, game_question, member, "question")]
        require_can_advance(member, room, session)
        if not _round_complete(session, game_question):
            raise GameError("Runda še ni končana.")
        if _check_winner(session) is not None:
            return finalize_dirka(session, room, reason="race_won")
        old_id = game_question.id
        nxt = _ensure_next_question(session, game_question)
        if nxt is None:
            return finalize_dirka(session, room, reason="pool_exhausted")
        now = timezone.now()
        if nxt.started_at is None:
            nxt.started_at = now
            nxt.save(update_fields=["started_at"])
        session.current_question_index = nxt.order
        session.save(update_fields=["current_question_index"])
        _reset_round_state(session, nxt, now, tick_shield=True)
        # _reset_round_state zbriše auto_advance_for — označi, da je prehod iz te runde končan.
        state = dict(session.state or {})
        state["auto_advance_for"] = f"done:{old_id}"
        state.pop("auto_advance_at", None)
        session.state = state
        session.save(update_fields=["state"])
        return [question_payload(session, nxt, member, "question")]


def _ensure_next_question(session, game_question):
    nxt = (
        session.game_questions.select_related("question__category")
        .prefetch_related("question__options")
        .filter(order=game_question.order + 1)
        .first()
    )
    if nxt is not None:
        return nxt
    # Dinamično dodaj še eno vprašanje iz preostanka poola.
    settings = session.room.settings or {}
    state = dict(session.state or {})
    used = set(state.get("used_question_ids") or [])
    slugs = settings.get("categories") or []
    remaining = list(
        Question.objects.filter(category__slug__in=slugs, is_active=True)
        .exclude(id__in=used)
        .select_related("category")[:20]
    )
    if not remaining:
        return None
    question = random.choice(remaining)
    nxt = GameQuestion.objects.create(
        game_session=session,
        question=question,
        order=game_question.order + 1,
        started_at=None,
    )
    used.add(question.id)
    state["used_question_ids"] = list(used)
    session.state = state
    session.total_questions = nxt.order + 1
    session.save(update_fields=["state", "total_questions"])
    return nxt


def claim_auto_advance_dirka(member_id):
    """Načrt samodejnega next. Vrne plan tudi, če je že claiman (preostali delay) — za vse WS."""
    with transaction.atomic():
        member, room, session = _lock(member_id)
        if session is None or session.status != "active" or session.mode != MODE_DIRKA:
            return None
        game_question = _current(session)
        if not _round_complete(session, game_question):
            return None
        if _check_winner(session) is not None:
            marker = f"finish:{game_question.id}"
            finish = True
        else:
            marker = f"next:{game_question.id}"
            finish = False
        state = dict(session.state or {})
        if str(state.get("auto_advance_for") or "") == f"done:{game_question.id}":
            return None
        now = timezone.now()
        host = room.members.filter(left_at__isnull=True, is_host=True).first() or member
        if state.get("auto_advance_for") == marker:
            advance_at = _parse_dt(state.get("auto_advance_at"))
            delay = max(0.0, (advance_at - now).total_seconds()) if advance_at else 0.0
            return {
                "host_member_id": str(host.id),
                "delay": delay,
                "finish": finish,
                "marker": marker,
            }
        delay = float(DIRKA_ROUND_ADVANCE_SECONDS)
        state["auto_advance_for"] = marker
        state["auto_advance_at"] = (now + timedelta(seconds=delay)).isoformat()
        session.state = state
        session.save(update_fields=["state"])
        return {
            "host_member_id": str(host.id),
            "delay": delay,
            "finish": finish,
            "marker": marker,
        }


def claim_bot_schedule_dirka(member_id):
    with transaction.atomic():
        member, room, session = _lock(member_id)
        if session is None or session.status != "active" or session.mode != MODE_DIRKA:
            return []
        game_question = _current(session)
        if game_question.started_at is None:
            return []
        state = dict(session.state or {})
        marker = str(game_question.id)
        if state.get("bots_scheduled_for") == marker:
            return []
        state["bots_scheduled_for"] = marker
        session.state = state
        session.save(update_fields=["state"])
        plans = []
        for bot in _members(session):
            if not bot.is_bot:
                continue
            if _answer_for(game_question, bot) is not None:
                continue
            profile = bot.bot_profile
            delay_min = float(profile.delay_min) if profile else 1.5
            delay_max = float(profile.delay_max) if profile else 8.0
            personal = _deadline_for(session, str(bot.id))
            if personal is not None and game_question.started_at is not None:
                remaining = max(1.0, (personal - timezone.now()).total_seconds() * 0.7)
                delay_max = min(delay_max, remaining)
            delay = random.uniform(delay_min, max(delay_min, delay_max))
            accuracy = float(profile.accuracy) if profile else 0.72
            # Enostavna uporaba bonusov pred odgovorom.
            bonus_msg = _bot_maybe_use_bonus(session, bot, game_question)
            plans.append(
                {
                    "member_id": str(bot.id),
                    "delay": delay,
                    "bonus": bonus_msg,
                    "message": _bot_answer_message(game_question, accuracy=accuracy),
                }
            )
        return plans


def _bot_maybe_use_bonus(session, bot, game_question):
    """Vrne use_bonus sporočilo ali None; ne porabi charge tukaj — kliče se prek WS path."""
    state = session.state or {}
    players = state.get("players") or {}
    stats = players.get(str(bot.id)) or {}
    bonuses = dict(stats.get("bonuses") or {})
    score = int(stats.get("score") or 0)
    target = int(state.get("target_score") or 200)
    standings_rows = standings(session)
    my_rank = next((row["rank"] for row in standings_rows if row["member_id"] == str(bot.id)), 99)
    # Prioritete: shield če zaostaja, double če streak, steal če blizu.
    if my_rank > 1 and bonuses.get("shield", 0) > 0 and random.random() < 0.35:
        return {"type": "use_bonus", "effect": "shield", "game_question_id": str(game_question.id)}
    if int(stats.get("streak") or 0) >= 2 and bonuses.get("double", 0) > 0 and random.random() < 0.4:
        return {"type": "use_bonus", "effect": "double", "game_question_id": str(game_question.id)}
    if score >= target * 0.6 and bonuses.get("steal", 0) > 0 and random.random() < 0.3:
        return {"type": "use_bonus", "effect": "steal", "game_question_id": str(game_question.id)}
    if bonuses.get("hint", 0) > 0 and random.random() < 0.2:
        return {"type": "use_bonus", "effect": "hint", "game_question_id": str(game_question.id)}
    return None


def use_dirka_bonus(member_id, message):
    if not isinstance(message, dict):
        raise GameError("Neveljavno sporočilo.")
    effect = str(message.get("effect") or message.get("bonus") or "").strip()
    if effect not in DIRKA_ACTIVE_BONUSES:
        raise GameError("Neznan bonus.")
    with transaction.atomic():
        member, room, session = _lock(member_id)
        if session is None or session.status != "active" or session.mode != MODE_DIRKA:
            raise GameError("Igra ni aktivna.")
        game_question = _current(session)
        if str(message.get("game_question_id") or "") not in {"", str(game_question.id)}:
            raise GameError("To vprašanje ni aktivno.")
        if _answer_for(game_question, member) is not None and effect not in {"shield"}:
            raise GameError("Bonus po odgovoru ni na voljo.")
        state = dict(session.state or {})
        players = dict(state.get("players") or {})
        key = str(member.id)
        stats = dict(players.get(key) or {})
        if stats.get("blocked") and effect not in {"skip"}:
            raise GameError("Blokiran si — bonusov ne moreš uporabiti.")
        bonuses = dict(stats.get("bonuses") or {})
        if int(bonuses.get(effect) or 0) <= 0:
            raise GameError("Ta bonus ni na voljo.")
        armed = dict(stats.get("armed") or {})
        result = {"effect": effect}
        if effect == "fifty_fifty":
            result.update(_apply_fifty_fifty(game_question, stats))
        elif effect == "hint":
            result.update(_apply_hint(game_question, stats))
        elif effect == "extra_time":
            deadlines = dict(state.get("deadlines") or {})
            current = _parse_dt(deadlines.get(key)) or (
                game_question.started_at + timedelta(seconds=_time_limit(session))
                if game_question.started_at
                else timezone.now()
            )
            deadlines[key] = (current + timedelta(seconds=DIRKA_EXTRA_TIME)).isoformat()
            state["deadlines"] = deadlines
            result["deadline_at"] = deadlines[key]
            result["extra_seconds"] = DIRKA_EXTRA_TIME
        elif effect == "second_chance":
            stats["second_chance"] = True
            result["armed"] = True
        elif effect == "skip":
            bonuses[effect] = int(bonuses.get(effect) or 0) - 1
            stats["bonuses"] = bonuses
            players[key] = stats
            state["players"] = players
            session.state = state
            session.save(update_fields=["state"])
            _store_skip(member, session, game_question)
            if _round_complete(session, game_question):
                if _check_winner(session) is not None:
                    return finalize_dirka(session, room, reason="race_won")
                return broadcast_round_review(session, game_question)
            return [waiting_answers_message(session, game_question, member)]
        elif effect == "shield":
            stats["shield_left"] = DIRKA_SHIELD_ROUNDS
            stats["shield"] = True
            result["armed"] = True
            result["shield_left"] = DIRKA_SHIELD_ROUNDS
        elif effect == "steal":
            armed["steal"] = True
            stats["armed"] = armed
            result["armed"] = True
        elif effect == "rush":
            opponents = [mid for mid in players if mid != key]
            if not opponents:
                raise GameError("Ni nasprotnikov za Pospešek.")
            deadlines = dict(state.get("deadlines") or {})
            now = timezone.now()
            default_limit = _time_limit(session)
            for target in opponents:
                current = _parse_dt(deadlines.get(target)) or now + timedelta(seconds=default_limit)
                remaining = max(0.0, (current - now).total_seconds())
                rushed = now + timedelta(seconds=min(DIRKA_RUSH_CAP, remaining * 0.5))
                deadlines[target] = rushed.isoformat()
            state["deadlines"] = deadlines
            result["target_ids"] = opponents
            result["rushed_all"] = True
        elif effect == "double":
            armed["double"] = True
            stats["armed"] = armed
            result["armed"] = True
        elif effect == "block":
            opponents = [mid for mid in players if mid != key]
            if not opponents:
                raise GameError("Ni nasprotnikov za Blokado.")
            for target in opponents:
                tstats = dict(players.get(target) or {})
                tstats["block_pending"] = True
                players[target] = tstats
            result["target_ids"] = opponents
            result["blocked_all"] = True
        else:
            raise GameError("Neznan bonus.")

        bonuses[effect] = int(bonuses.get(effect) or 0) - 1
        stats["bonuses"] = bonuses
        players[key] = stats
        state["players"] = players
        session.state = state
        session.save(update_fields=["state"])
        payload = question_payload(session, game_question, member, "bonus_result")
        payload["bonus"] = result
        payload["bonus_member_id"] = str(member.id)
        return [payload]


def question_payload(session, game_question, member, message_type="question"):
    base = question_message(session, game_question, message_type)
    base["mode"] = MODE_DIRKA
    base["phase"] = "question"
    base["prize_ladder"] = []
    base["stake"] = None
    base["next_stake"] = None
    base["can_walk_away"] = False
    base["lifelines"] = {}
    base["answered_count"] = game_question.answers.count()
    base["player_count"] = len(_members(session))
    base["host_member_id"] = _host_id(session)
    _attach_shared_player_state(base, session)
    # Za TimerBar: privzeti deadline — klient naj uporabi players[myId].deadline_at.
    deadlines = base.get("deadlines") or {}
    if deadlines:
        base["deadline_at"] = next(iter(deadlines.values()))
    return base


def waiting_answers_message(session, game_question, member, message_type="answer_progress"):
    members = _members(session)
    waiting = [item for item in members if _answer_for(game_question, item) is None]
    answered = [item for item in members if _answer_for(game_question, item) is not None]
    payload = {
        "type": message_type,
        "phase": "answer_progress",
        "mode": MODE_DIRKA,
        "index": game_question.order,
        "total": session.total_questions,
        "question": public_question(game_question),
        "server_now": timezone.now().isoformat(),
        "time_limit_seconds": session.time_limit_seconds,
        "answered_count": len(answered),
        "player_count": len(members),
        "host_member_id": _host_id(session),
        "answered_ids": [str(item.id) for item in answered],
        "waiting_for_ids": [str(item.id) for item in waiting],
        "waiting_for": [item.nickname_in_room for item in waiting],
    }
    return _attach_shared_player_state(payload, session)


def round_review_message(session, game_question, member, message_type="round_review"):
    answers = list(
        game_question.answers.select_related("room_member", "room_member__user").order_by(
            "time_taken_ms", "answered_at"
        )
    )
    players = (session.state or {}).get("players") or {}
    rows = []
    for answer in answers:
        data = answer.answer_data or {}
        mid = str(answer.room_member_id)
        stats = players.get(mid) or {}
        row = {
            "nickname": answer.room_member.nickname_in_room,
            "avatar": stats.get("avatar") or avatar_for_member(answer.room_member),
            "color": stats.get("color") or answer.room_member.color or "",
            "is_correct": bool(answer.is_correct),
            "timed_out": bool(data.get("timeout")),
            "skipped": bool(data.get("skip")),
            "points": answer.points,
            "time_taken_ms": answer.time_taken_ms,
            "steal": int(data.get("steal") or 0),
            "stolen_amount": int(data.get("stolen_amount") or 0),
            "streak_bonus": int(data.get("streak_bonus") or 0),
            "shielded": bool(data.get("shielded")),
            "steal_blocked": bool(data.get("steal_blocked")),
            "member_id": mid,
        }
        gained = data.get("bonuses_gained") or ([] if not data.get("bonus_gained") else [data.get("bonus_gained")])
        if gained:
            row["bonuses_gained"] = list(gained)
            row["bonus_gained"] = gained[-1]
        if data.get("safe_reward"):
            row["safe_reward"] = int(data.get("safe_reward") or 0)
        if data.get("clean_sheet"):
            row["clean_sheet"] = True
        if data.get("breakthrough"):
            row["breakthrough"] = True
        if data.get("solo_sprint"):
            row["solo_sprint"] = True
        if data.get("bonus_convert"):
            row["bonus_convert"] = data.get("bonus_convert")
        row.update(_selected(answer))
        rows.append(row)
    body = {
        "type": message_type,
        "phase": "round_review",
        "mode": MODE_DIRKA,
        "index": game_question.order,
        "total": session.total_questions,
        "question": public_question(game_question),
        "explanation": game_question.question.explanation,
        "answers": rows,
        "is_last": False,
        "is_host": member.is_host,
        "host_member_id": _host_id(session),
        "advance_seconds": DIRKA_ROUND_ADVANCE_SECONDS,
        "server_now": timezone.now().isoformat(),
    }
    body.update(_reveal(game_question))
    return _attach_shared_player_state(body, session)


def _apply_solo_sprint(session, game_question):
    """Edini pravilen v rundi (ostali miss/skip/timeout) → močan. Min 2 odgovora."""
    answers = list(game_question.answers.all())
    if len(answers) < 2:
        return
    correct = [item for item in answers if item.is_correct]
    if len(correct) != 1:
        return
    ans = correct[0]
    if (ans.answer_data or {}).get("solo_sprint"):
        return
    mid = str(ans.room_member_id)
    state = dict(session.state or {})
    players = dict(state.get("players") or {})
    stats = dict(players.get(mid) or {})
    bonuses_gained: list[str] = []
    granted = _grant_random_bonus(stats, DIRKA_STRONG_BONUSES)
    if not granted:
        return
    bonuses_gained.append(granted)
    data = dict(ans.answer_data or {})
    _flush_pending_converts(stats, data, bonuses_gained)
    existing = list(data.get("bonuses_gained") or [])
    for effect in bonuses_gained:
        if effect not in existing:
            existing.append(effect)
    data["bonuses_gained"] = existing
    data["bonus_gained"] = existing[-1]
    data["solo_sprint"] = True
    ans.answer_data = data
    ans.save(update_fields=["answer_data"])
    players[mid] = stats
    state["players"] = players
    session.state = state
    session.save(update_fields=["state"])


def broadcast_round_review(session, game_question):
    _apply_solo_sprint(session, game_question)
    host = session.room.members.filter(left_at__isnull=True, is_host=True).first()
    member = host or session.room.members.filter(left_at__isnull=True).first()
    return [round_review_message(session, game_question, member)]


def finished_dirka(session, member):
    from game.replay import result_id_for

    payload = {
        "type": "game_finished",
        "phase": "finished",
        "finished": True,
        "mode": MODE_DIRKA,
        "reason": (session.state or {}).get("reason") or "completed",
        "total": session.total_questions,
        "total_questions": session.total_questions,
        "nickname": member.nickname_in_room,
        "host_member_id": _host_id(session),
    }
    _attach_shared_player_state(payload, session)
    mine = (payload.get("players") or {}).get(str(member.id)) or {}
    payload["score"] = mine.get("score", 0)
    rid = result_id_for(session, member=member)
    if rid:
        payload["result_id"] = rid
    return payload


def finalize_dirka(session, room, reason="completed"):
    now = timezone.now()
    state = dict(session.state or {})
    state["reason"] = reason
    session.status = "finished"
    session.finished_at = now
    session.state = state
    session.save(update_fields=["status", "finished_at", "state"])
    room.status = "finished"
    room.finished_at = now
    room.save(update_fields=["status", "finished_at"])
    duration = None
    if session.started_at:
        duration = max(0, int((now - session.started_at).total_seconds() * 1000))
    members = list(room.members.filter(left_at__isnull=True).select_related("user", "bot_profile"))
    players = state.get("players") or {}
    result_ids = {}
    for member in members:
        stats = players.get(str(member.id)) or {}
        on_board = True
        if member.is_bot:
            on_board = bool(member.bot_profile and member.bot_profile.count_for_leaderboard)
        row = GameResult.objects.create(
            game_session=session,
            user=member.user,
            nickname=member.nickname_in_room,
            mode=MODE_DIRKA,
            score=int(stats.get("score") or 0),
            prize_reached=0,
            speed_bonus=int(stats.get("speed_bonus_total") or 0),
            correct_count=int(stats.get("correct_count") or 0),
            total_questions=session.current_question_index + 1,
            duration_ms=duration,
            is_guest=bool(member.user.is_guest) if member.user_id else True,
            counts_for_leaderboard=on_board,
            reason=reason,
            room_code=room.code,
        )
        result_ids[str(member.id)] = row.id
    host = next((item for item in members if item.is_host), members[0] if members else None)
    if not host:
        return []
    payload = finished_dirka(session, host)
    payload["result_ids"] = result_ids
    if str(host.id) in result_ids:
        payload["result_id"] = result_ids[str(host.id)]
    return [payload]


def standings(session):
    players = (session.state or {}).get("players") or {}
    target = int((session.state or {}).get("target_score") or 200)
    rows = []
    for member_id, stats in players.items():
        rows.append(
            {
                "member_id": member_id,
                "nickname": stats.get("nickname") or "?",
                "color": stats.get("color") or "",
                "avatar": stats.get("avatar")
                or resolve_avatar_key(nickname=stats.get("nickname") or "", seed=member_id),
                "score": int(stats.get("score") or 0),
                "safe_locked": int(stats.get("safe_locked") or 0),
                "correct_count": int(stats.get("correct_count") or 0),
                "streak": int(stats.get("streak") or 0),
                "is_bot": bool(stats.get("is_bot")),
                "target_score": target,
                "bonuses": dict(stats.get("bonuses") or {}),
            }
        )
    rows.sort(key=lambda item: (-item["score"], -item["correct_count"], item["nickname"]))
    for index, row in enumerate(rows, start=1):
        row["rank"] = index
    return rows


def players_view(session):
    """Osebni podatki po member_id — za skupni WS broadcast (vsak klient vzame svoj id)."""
    players = (session.state or {}).get("players") or {}
    deadlines = (session.state or {}).get("deadlines") or {}
    target = int((session.state or {}).get("target_score") or 200)
    safe_every = int((session.state or {}).get("safe_every") or 5)
    out = {}
    for member_id, stats in players.items():
        in_segment = int(stats.get("correct_in_segment") or 0)
        out[member_id] = {
            "member_id": member_id,
            "nickname": stats.get("nickname") or "?",
            "score": int(stats.get("score") or 0),
            "safe_locked": int(stats.get("safe_locked") or 0),
            "correct_count": int(stats.get("correct_count") or 0),
            "correct_in_segment": in_segment,
            "segment_misses": int(stats.get("segment_misses") or 0),
            "until_safe": max(0, safe_every - in_segment),
            "streak": int(stats.get("streak") or 0),
            "bonuses": dict(stats.get("bonuses") or {}),
            "armed": dict(stats.get("armed") or {}),
            "active_helps": dict(stats.get("active_helps") or {}),
            "shield": _shield_active(stats),
            "shield_left": _shield_left(stats),
            "second_chance": bool(stats.get("second_chance")),
            "blocked": bool(stats.get("blocked")),
            "is_bot": bool(stats.get("is_bot")),
            "deadline_at": deadlines.get(member_id),
            "target_score": target,
            "safe_every": safe_every,
        }
    return out


def player_stats(session, member):
    view = players_view(session).get(str(member.id))
    if view is not None:
        return dict(view)
    players = (session.state or {}).get("players") or {}
    stats = dict(players.get(str(member.id)) or {})
    stats["member_id"] = str(member.id)
    stats["target_score"] = int((session.state or {}).get("target_score") or 200)
    stats["safe_every"] = int((session.state or {}).get("safe_every") or 5)
    return stats


def _attach_shared_player_state(payload, session):
    """Skupni broadcast: osebni bonusi so v players[], ne na vrhu od tujega igralca."""
    views = players_view(session)
    payload["players"] = views
    payload["standings"] = standings(session)
    payload["target_score"] = int((session.state or {}).get("target_score") or 200)
    payload["safe_every"] = int((session.state or {}).get("safe_every") or 5)
    payload["max_bonus_types"] = int(site_get("dirka_max_bonus_types"))
    payload["deadlines"] = (session.state or {}).get("deadlines") or {}
    # Ne vtakni tujih bonusov na root — klient bere players[myId].
    payload.pop("bonuses", None)
    payload.pop("armed", None)
    payload.pop("active_helps", None)
    payload.pop("you", None)
    return payload


def seconds_until_dirka_deadline(game_question_id, member_id=None):
    try:
        game_question = GameQuestion.objects.select_related("game_session", "game_session__room").get(
            pk=game_question_id
        )
    except GameQuestion.DoesNotExist:
        return None
    session = game_question.game_session
    if session.status != "active" or session.mode != MODE_DIRKA:
        return None
    if game_question.order != session.current_question_index or game_question.started_at is None:
        return None
    if _round_complete(session, game_question):
        return None
    now = timezone.now()
    soonest = None
    for item in _members(session):
        if _answer_for(game_question, item) is not None:
            continue
        deadline = _deadline_for(session, str(item.id))
        if deadline is None:
            continue
        remaining = (deadline - now).total_seconds()
        if soonest is None or remaining < soonest:
            soonest = remaining
    if soonest is None:
        return None
    return max(0.0, soonest)


def _host_id(session):
    host = session.room.members.filter(left_at__isnull=True, is_host=True).first()
    return str(host.id) if host else None


def _members(session):
    return list(session.room.members.filter(left_at__isnull=True))


def _round_complete(session, game_question):
    members = _members(session)
    if not members:
        return True
    return game_question.answers.filter(room_member_id__in=[item.id for item in members]).count() >= len(members)


def _deadline_for(session, member_id):
    deadlines = (session.state or {}).get("deadlines") or {}
    return _parse_dt(deadlines.get(member_id))


def _parse_dt(value):
    if not value:
        return None
    if hasattr(value, "isoformat"):
        return value
    parsed = parse_datetime(str(value))
    if parsed is None:
        return None
    if timezone.is_naive(parsed):
        return timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


def _all_deadlines_passed(session, game_question):
    now = timezone.now()
    for item in _members(session):
        if _answer_for(game_question, item) is not None:
            continue
        deadline = _deadline_for(session, str(item.id))
        if deadline is None or now <= deadline:
            return False
    return True


def _apply_personal_timeouts(session, game_question):
    now = timezone.now()
    for item in _members(session):
        if _answer_for(game_question, item) is not None:
            continue
        deadline = _deadline_for(session, str(item.id))
        if deadline is not None and now > deadline:
            _store_answer(item, session, game_question, {"timeout": True})


def _apply_timeouts(session, game_question):
    now = timezone.now()
    for item in _members(session):
        if _answer_for(game_question, item) is not None:
            continue
        _store_answer(item, session, game_question, {"timeout": True})
    if game_question.ended_at is None:
        game_question.ended_at = now
        game_question.save(update_fields=["ended_at"])


def _check_winner(session):
    target = int((session.state or {}).get("target_score") or 200)
    players = (session.state or {}).get("players") or {}
    winners = [mid for mid, stats in players.items() if int(stats.get("score") or 0) >= target]
    if not winners:
        return None
    return max(winners, key=lambda mid: int((players.get(mid) or {}).get("score") or 0))


def _standings_from_players(players, target_score=200):
    """Lestvica iz podanega players dict (lahko še ne shranjenega session.state)."""
    rows = []
    for member_id, stats in (players or {}).items():
        rows.append(
            {
                "member_id": member_id,
                "nickname": stats.get("nickname") or "?",
                "score": int(stats.get("score") or 0),
                "correct_count": int(stats.get("correct_count") or 0),
                "target_score": target_score,
            }
        )
    rows.sort(key=lambda item: (-item["score"], -item["correct_count"], item["nickname"]))
    for index, row in enumerate(rows, start=1):
        row["rank"] = index
    return rows


def _target_ahead(session, member_id, players=None):
    """Tarča = igralec tik pred tabo; če si 1., vzemi 2. (Rush/Block/Steal)."""
    state = session.state or {}
    target_score = int(state.get("target_score") or 200)
    if players is not None:
        rows = _standings_from_players(players, target_score)
    else:
        rows = standings(session)
    my = next((row for row in rows if row["member_id"] == member_id), None)
    if my is None:
        return None
    if my["rank"] == 1:
        ahead = next((row for row in rows if row["rank"] == 2), None)
    else:
        ahead = next((row for row in rows if row["rank"] == my["rank"] - 1), None)
    return ahead["member_id"] if ahead else None


def _clamp_score(stats, delta):
    score = int(stats.get("score") or 0) + int(delta)
    locked = int(stats.get("safe_locked") or 0)
    stats["score"] = max(locked, score)
    return stats


def _shield_left(stats) -> int:
    left = int(stats.get("shield_left") or 0)
    if left > 0:
        return left
    # Stare seje / testi z boolean ščitom = še 1 runda.
    return 1 if stats.get("shield") else 0


def _shield_active(stats) -> bool:
    return _shield_left(stats) > 0


def _store_skip(member, session, game_question):
    now = timezone.now()
    elapsed = max(0, int((now - game_question.started_at).total_seconds() * 1000)) if game_question.started_at else 0
    PlayerAnswer.objects.create(
        game_question=game_question,
        room_member=member,
        answer_data={"skip": True},
        is_correct=False,
        answered_at=now,
        time_taken_ms=elapsed,
        points=0,
    )
    state = dict(session.state or {})
    players = dict(state.get("players") or {})
    key = str(member.id)
    stats = dict(players.get(key) or {})
    stats["streak"] = 0
    stats["segment_misses"] = int(stats.get("segment_misses") or 0) + 1
    players[key] = stats
    state["players"] = players
    session.state = state
    session.save(update_fields=["state"])


def _store_answer(member, session, game_question, message):
    now = timezone.now()
    if game_question.started_at is None:
        raise GameError("Vprašanje še ni začeto.")
    state = dict(session.state or {})
    players = dict(state.get("players") or {})
    key = str(member.id)
    stats = dict(players.get(key) or {"nickname": member.nickname_in_room, "color": member.color})
    wants_timeout = bool(message.get("timeout"))
    deadline = _deadline_for(session, key)
    # Ljudje ne smejo oddati timeout pred lastnim deadlineom (enako kot Hitra tekma).
    if wants_timeout and not member.is_bot and deadline is not None and now < deadline:
        wants_timeout = False
    timed_out = wants_timeout or (deadline is not None and now > deadline)

    if timed_out:
        is_correct = False
        answer_data = {"timeout": True}
        selected = None
        points = 0
    else:
        presentation = ensure_presentation(game_question)
        is_correct = grade_answer(game_question.question, message, presentation)
        answer_data = _stored_answer(message)
        selected = _selected_option(game_question, message)
        points = 0

    # Second chance: prvi miss ne šteje, ostaneš na Q.
    if not is_correct and not timed_out and stats.get("second_chance"):
        stats["second_chance"] = False
        players[key] = stats
        state["players"] = players
        session.state = state
        session.save(update_fields=["state"])
        return "second_chance"

    elapsed = max(0, int((now - game_question.started_at).total_seconds() * 1000))
    armed = dict(stats.get("armed") or {})
    safe_every = int(state.get("safe_every") or 5)
    target_score = int(state.get("target_score") or 200)

    if is_correct:
        base = int(site_get("dirka_base_points"))
        limit_ms = _time_limit(session) * 1000
        speed = round(((limit_ms - min(elapsed, limit_ms)) / limit_ms) * DIRKA_MAX_SPEED_BONUS)
        want_double = bool(armed.pop("double", None))
        # Comeback: +30 % na (base+speed), enkrat ko si dovolj zaostal / comeback_armed.
        leaders = standings(session)
        leader_score = leaders[0]["score"] if leaders else 0
        my_score = int(stats.get("score") or 0)
        if leader_score - my_score >= int(site_get("dirka_comeback_gap")) or stats.get("comeback_armed"):
            mult = float(site_get("dirka_comeback_mult"))
            base = int(round(base * mult))
            speed = int(round(speed * mult))
            answer_data["comeback"] = True
            stats["comeback_armed"] = False
        points = base + speed
        streak = int(stats.get("streak") or 0) + 1
        stats["streak"] = streak
        streak_bonus = 0
        bonuses_gained: list[str] = []
        if streak == int(site_get("dirka_streak_at")):
            streak_bonus = int(site_get("dirka_streak_bonus"))
            granted = _grant_random_bonus(stats, DIRKA_WEAK_BONUSES)
            if granted:
                bonuses_gained.append(granted)
        elif streak == int(site_get("dirka_hot_streak_at")):
            streak_bonus = int(site_get("dirka_hot_streak_bonus"))
            # Hot streak → šibki drop (seed / plan); močni dropi so za clean safe.
            granted = _grant_random_bonus(stats, DIRKA_WEAK_BONUSES)
            if granted:
                answer_data["hot_streak_bonus"] = granted
                bonuses_gained.append(granted)
        if streak_bonus:
            points += streak_bonus
            answer_data["streak_bonus"] = streak_bonus
        if want_double:
            # Dvojne točke za celoten izkupiček vprašanja (brez safe_reward / steal).
            points *= 2
            speed *= 2
            answer_data["double"] = True
        stats = _clamp_score(stats, points)
        stats["correct_count"] = int(stats.get("correct_count") or 0) + 1
        stats["correct_in_segment"] = int(stats.get("correct_in_segment") or 0) + 1
        stats["speed_bonus_total"] = int(stats.get("speed_bonus_total") or 0) + speed
        # Safe zone (ni pod double)
        if stats["correct_in_segment"] >= safe_every:
            clean = int(stats.get("segment_misses") or 0) == 0
            reward = DIRKA_SAFE_REWARD + (DIRKA_CLEAN_SHEET if clean else 0)
            stats = _clamp_score(stats, reward)
            stats["safe_locked"] = int(stats.get("score") or 0)
            stats["correct_in_segment"] = 0
            stats["segment_misses"] = 0
            answer_data["safe_reward"] = reward
            points += reward
            if clean:
                answer_data["clean_sheet"] = True
            # Ob safe zone dobiš bonus (močnejši, če clean sheet).
            pool = DIRKA_STRONG_BONUSES if clean else DIRKA_WEAK_BONUSES
            granted = _grant_random_bonus(stats, pool)
            if granted:
                bonuses_gained.append(granted)
        # Steal — tarča po posodobitvi lastnega score-a; ščit tarče blokira krajo
        # (ščit se NE porabi — traja do poteka rund).
        if armed.pop("steal", None):
            players[key] = stats
            target_id = _target_ahead(session, key, players=players)
            if target_id and target_id in players and target_id != key:
                tstats = dict(players.get(target_id) or {})
                if _shield_active(tstats):
                    answer_data["steal"] = 0
                    answer_data["steal_blocked"] = True
                    answer_data["steal_from"] = target_id
                else:
                    steal_amt = random.randint(
                        int(site_get("dirka_steal_min")), int(site_get("dirka_steal_max"))
                    )
                    before = int(tstats.get("score") or 0)
                    tstats = _clamp_score(tstats, -steal_amt)
                    actual = before - int(tstats.get("score") or 0)
                    players[target_id] = tstats
                    if actual > 0:
                        stats = _clamp_score(stats, actual)
                        points += actual
                        answer_data["steal"] = actual
                        answer_data["steal_from"] = target_id
                        _annotate_stolen_from(game_question, target_id, key, actual)
        # Preboj: prvič ≥ 50 % cilja → močan (1×).
        threshold = int(target_score * DIRKA_BREAKTHROUGH_RATIO)
        if (
            not stats.get("breakthrough_claimed")
            and int(stats.get("score") or 0) >= threshold
            and threshold > 0
        ):
            stats["breakthrough_claimed"] = True
            granted = _grant_random_bonus(stats, DIRKA_STRONG_BONUSES)
            if granted:
                bonuses_gained.append(granted)
                answer_data["breakthrough"] = True
        _flush_pending_converts(stats, answer_data, bonuses_gained)
        if bonuses_gained:
            answer_data["bonuses_gained"] = bonuses_gained
            answer_data["bonus_gained"] = bonuses_gained[-1]
        stats["armed"] = armed
    else:
        # miss / timeout — ščit prepreči kazen (nič ne gre nasprotniku); runde tečejo naprej.
        stats["streak"] = 0
        stats["segment_misses"] = int(stats.get("segment_misses") or 0) + 1
        armed_clear = dict(stats.get("armed") or {})
        armed_clear.pop("steal", None)
        armed_clear.pop("double", None)
        stats["armed"] = armed_clear
        if _shield_active(stats):
            answer_data["shielded"] = True
            answer_data["shield_left"] = _shield_left(stats)
            points = 0
        else:
            points = -int(site_get("dirka_penalty"))
            stats = _clamp_score(stats, points)
            stats["penalty_total"] = int(stats.get("penalty_total") or 0) + int(site_get("dirka_penalty"))
        # Arm comeback if far behind after miss
        others = [int((players.get(mid) or {}).get("score") or 0) for mid in players if mid != key]
        lead = max(others) if others else 0
        if lead - int(stats.get("score") or 0) >= int(site_get("dirka_comeback_gap")):
            stats["comeback_armed"] = True

    PlayerAnswer.objects.create(
        game_question=game_question,
        room_member=member,
        selected_option=selected,
        answer_data=answer_data,
        is_correct=is_correct,
        answered_at=now,
        time_taken_ms=elapsed,
        points=points,
    )
    players[key] = stats
    state["players"] = players
    session.state = state
    session.save(update_fields=["state"])
    return True


def _annotate_stolen_from(game_question, victim_member_id, thief_member_id, amount):
    """Zapiši krajo na že oddan odgovor žrtve (za round review)."""
    answer = (
        PlayerAnswer.objects.filter(game_question=game_question, room_member_id=victim_member_id)
        .order_by("-id")
        .first()
    )
    if answer is None or amount <= 0:
        return
    data = dict(answer.answer_data or {})
    data["stolen_amount"] = int(data.get("stolen_amount") or 0) + int(amount)
    data["stolen_by"] = str(thief_member_id)
    answer.answer_data = data
    answer.points = int(answer.points or 0) - int(amount)
    answer.save(update_fields=["answer_data", "points"])


def _apply_fifty_fifty(game_question, stats):
    question = game_question.question
    helps = dict(stats.get("active_helps") or {})
    if question.question_type in SINGLE_TYPES:
        options = list(question.options.all())
        wrong = [opt.id for opt in options if not opt.is_correct]
        if len(wrong) < 2:
            if len(wrong) == 1:
                eliminated = wrong
            else:
                raise GameError("Polovičke ni mogoče uporabiti.")
        else:
            eliminated = random.sample(wrong, 2)
        payload = {"eliminated_option_ids": eliminated}
        helps["fifty_fifty"] = payload
        stats["active_helps"] = helps
        return payload
    if question.question_type == Question.Type.MATCHING:
        presentation = ensure_presentation(game_question)
        links = list(presentation.get("links") or [])
        if len(links) < 2:
            raise GameError("Polovičke ni mogoče uporabiti.")
        picked = random.sample(links, min(2, len(links)))
        pairs = [{"left_id": link["left_id"], "right_id": link["right_id"]} for link in picked]
        payload = {"revealed_pairs": pairs}
        helps["fifty_fifty"] = payload
        stats["active_helps"] = helps
        return payload
    if question.question_type == Question.Type.SLIDER:
        config = question.config or {}
        minimum = float(config["min"])
        maximum = float(config["max"])
        correct = float(config["correct"])
        span = maximum - minimum
        half = max(span * 0.15, float(config.get("tolerance") or 1) * 2)
        payload = {
            "slider_min": max(minimum, correct - half),
            "slider_max": min(maximum, correct + half),
        }
        helps["fifty_fifty"] = payload
        stats["active_helps"] = helps
        return payload
    raise GameError("Polovička tu ni na voljo.")


def _apply_hint(game_question, stats):
    question = game_question.question
    helps = dict(stats.get("active_helps") or {})
    if question.question_type in SINGLE_TYPES:
        options = list(question.options.all())
        wrong = [opt.id for opt in options if not opt.is_correct]
        if not wrong:
            raise GameError("Hinta ni mogoče uporabiti.")
        eliminated = [random.choice(wrong)]
        payload = {"eliminated_option_ids": eliminated}
        helps["hint"] = payload
        stats["active_helps"] = helps
        return payload
    if question.question_type == Question.Type.MATCHING:
        presentation = ensure_presentation(game_question)
        links = list(presentation.get("links") or [])
        if not links:
            raise GameError("Hinta ni mogoče uporabiti.")
        link = random.choice(links)
        pairs = [{"left_id": link["left_id"], "right_id": link["right_id"]}]
        payload = {"revealed_pairs": pairs}
        helps["hint"] = payload
        stats["active_helps"] = helps
        return payload
    if question.question_type == Question.Type.SLIDER:
        config = question.config or {}
        minimum = float(config["min"])
        maximum = float(config["max"])
        correct = float(config["correct"])
        span = maximum - minimum
        half = max(span * 0.3, float(config.get("tolerance") or 1) * 3)
        payload = {
            "slider_min": max(minimum, correct - half),
            "slider_max": min(maximum, correct + half),
        }
        helps["hint"] = payload
        stats["active_helps"] = helps
        return payload
    raise GameError("Hint tu ni na voljo.")
