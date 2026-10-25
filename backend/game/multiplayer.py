"""Večigralski potek: isto vprašanje, čakanje na odgovore, rundni bonus, lestvica."""

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
    hard_end,
    official_end,
    question_message,
    require_can_advance,
    select_questions,
    speed_bonus,
)
from accounts.nicknames import avatar_for_member, resolve_avatar_key
from game.modes import MODE_MULTIPLAYER
from game.models import GameQuestion, GameResult, GameSession, PlayerAnswer
from game.presentation import ensure_presentation, public_question
from game.site_settings import get as site_get
from questions.models import Question
from rooms.models import RoomMember
from rooms.services import lobby_payload, refresh_can_start

SINGLE_TYPES = {Question.Type.MULTIPLE_CHOICE, Question.Type.TRUE_FALSE}


def snapshot_multiplayer(member_id):
    with transaction.atomic():
        member, room, session = _lock(member_id)
        if session is None:
            return lobby_event(room, member.user, "lobby")
        if session.status == "finished":
            return finished_multiplayer(session, member)
        game_question = _current(session)
        if not _is_alive(session, member):
            if _round_complete(session, game_question):
                return round_review_message(session, game_question, member, "game_state")
            return waiting_answers_message(session, game_question, member, "game_state")
        answer = _answer_for(game_question, member)
        if _round_complete(session, game_question):
            return round_review_message(session, game_question, member, "game_state")
        if answer is None:
            return question_payload(session, game_question, member, "game_state")
        return waiting_answers_message(session, game_question, member, "game_state")


def lobby_event(room, viewer, message_type="lobby"):
    payload = refresh_can_start(lobby_payload(room, viewer=viewer))
    payload["type"] = message_type
    payload["phase"] = "lobby"
    payload["mode"] = MODE_MULTIPLAYER
    return payload


def start_multiplayer(member_id):
    with transaction.atomic():
        member, room, session = _lock(member_id)
        if not member.is_host:
            raise GameError("Samo gostitelj lahko začne igro.")
        if session is not None:
            return [snapshot_multiplayer(member_id)]
        if room.status != "waiting":
            raise GameError("Igre ni mogoče začeti.")
        members = list(room.members.filter(left_at__isnull=True).select_related("user"))
        min_players = int(site_get("mp_min_players"))
        if len(members) < min_players:
            raise GameError(f"Potrebujeta vsaj {min_players} igralca.")
        if not all(item.is_ready or item.is_bot for item in members):
            raise GameError("Vsi igralci morajo biti pripravljeni.")
        settings = room.settings or {}
        questions = select_questions(
            settings.get("categories") or [],
            int(settings.get("question_count") or 10),
            settings.get("difficulty_progression") or "increasing",
        )
        now = timezone.now()
        players = {
            str(item.id): {
                "nickname": item.nickname_in_room,
                "color": item.color,
                "avatar": avatar_for_member(item),
                "score": 0,
                "correct_count": 0,
                "round_bonuses": 0,
                "main_points": 0,
                "speed_bonus_total": 0,
                "streak": 0,
                "streak_bonus_total": 0,
                "catchup_bonus_total": 0,
                "is_bot": item.is_bot,
                "alive": True,
            }
            for item in members
        }
        session = GameSession.objects.create(
            room=room,
            mode=MODE_MULTIPLAYER,
            status="active",
            total_questions=len(questions),
            current_question_index=0,
            time_limit_seconds=int(settings.get("time_limit_seconds") or 20),
            state={
                "players": players,
                "reason": "",
                "round_bonus_awarded": False,
                "sudden_death": bool(settings.get("sudden_death")),
                "alive": [str(item.id) for item in members],
                "bots_scheduled_for": None,
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
        return [question_payload(session, game_question, members[0], "game_started")]


def submit_multiplayer(member_id, message):
    if not isinstance(message, dict):
        raise GameError("Neveljavno sporočilo.")
    with transaction.atomic():
        member, room, session = _lock(member_id)
        if session is None or session.status != "active" or session.mode != MODE_MULTIPLAYER:
            raise GameError("Igra ni aktivna.")
        if not _is_alive(session, member):
            raise GameError("Izločen si iz igre.")
        game_question = _current(session)
        if str(message.get("game_question_id")) != str(game_question.id):
            raise GameError("To vprašanje ni aktivno.")
        existing = _answer_for(game_question, member)
        if existing is not None:
            if _round_complete(session, game_question):
                return broadcast_round_review(session, game_question)
            return [waiting_answers_message(session, game_question, member)]
        _store_answer(member, session, game_question, message)
        if _round_complete(session, game_question) or _should_force_timeout_round(session, game_question):
            _apply_timeouts(session, game_question)
            _award_round_bonus(session, game_question)
            _award_catchup_bonus(session, game_question)
            sudden = _apply_sudden_death(session, game_question)
            if sudden is not None:
                return sudden
            return broadcast_round_review(session, game_question)
        return [waiting_answers_message(session, game_question, member)]


def apply_multiplayer_timeout(member_id, game_question_id):
    with transaction.atomic():
        member, room, session = _lock(member_id)
        if session is None or session.status != "active" or session.mode != MODE_MULTIPLAYER:
            return []
        game_question = _current(session)
        if str(game_question.id) != str(game_question_id):
            return []
        if game_question.started_at is None or timezone.now() <= hard_end(game_question, session):
            return []
        _apply_timeouts(session, game_question)
        _award_round_bonus(session, game_question)
        _award_catchup_bonus(session, game_question)
        sudden = _apply_sudden_death(session, game_question)
        if sudden is not None:
            return sudden
        return broadcast_round_review(session, game_question)


def next_multiplayer(member_id):
    with transaction.atomic():
        member, room, session = _lock(member_id)
        if session is None or session.mode != MODE_MULTIPLAYER:
            raise GameError("Igra ni aktivna.")
        if session.status == "finished":
            return [finished_multiplayer(session, member)]
        game_question = _current(session)
        state = dict(session.state or {})
        # Prehod že narejen — resync trenutnega vprašanja (SFX dedupe na klientu).
        if str(state.get("auto_advance_for") or "").startswith("done:") and not _round_complete(
            session, game_question
        ):
            return [question_payload(session, game_question, member, "question")]
        require_can_advance(member, room, session)
        if not _round_complete(session, game_question):
            raise GameError("Runda še ni končana.")
        if game_question.order + 1 >= session.total_questions:
            return finalize_multiplayer(session, room)
        old_id = game_question.id
        nxt = (
            session.game_questions.select_related("question__category")
            .prefetch_related("question__options")
            .get(order=game_question.order + 1)
        )
        if nxt.started_at is None:
            nxt.started_at = timezone.now()
            nxt.save(update_fields=["started_at"])
        state = dict(session.state or {})
        state["round_bonus_awarded"] = False
        state["bots_scheduled_for"] = None
        state["auto_advance_for"] = f"done:{old_id}"
        state.pop("auto_advance_at", None)
        session.state = state
        session.current_question_index = nxt.order
        session.save(update_fields=["state", "current_question_index"])
        return [question_payload(session, nxt, member, "question")]


def claim_auto_advance(member_id):
    """Načrt samodejnega next. Vrne plan tudi, če je že claiman (preostali delay) — za vse WS."""
    with transaction.atomic():
        member, room, session = _lock(member_id)
        if session is None or session.status != "active" or session.mode != MODE_MULTIPLAYER:
            return None
        game_question = _current(session)
        if not _round_complete(session, game_question):
            return None
        if game_question.order + 1 >= session.total_questions:
            marker = f"finish:{game_question.id}"
        else:
            marker = f"next:{game_question.id}"
        state = dict(session.state or {})
        if str(state.get("auto_advance_for") or "") == f"done:{game_question.id}":
            return None
        now = timezone.now()
        delay_full = float(int(site_get("mp_round_advance_seconds")))
        host = room.members.filter(left_at__isnull=True, is_host=True).first() or member
        if state.get("auto_advance_for") == marker:
            raw_at = state.get("auto_advance_at")
            advance_at = raw_at if hasattr(raw_at, "isoformat") else parse_datetime(str(raw_at or ""))
            if advance_at is not None and timezone.is_naive(advance_at):
                advance_at = timezone.make_aware(advance_at, timezone.get_current_timezone())
            delay = max(0.0, (advance_at - now).total_seconds()) if advance_at else 0.0
            return {
                "host_member_id": str(host.id),
                "delay": delay,
                "finish": game_question.order + 1 >= session.total_questions,
                "marker": marker,
            }
        state["auto_advance_for"] = marker
        state["auto_advance_at"] = (now + timedelta(seconds=delay_full)).isoformat()
        session.state = state
        session.save(update_fields=["state"])
        return {
            "host_member_id": str(host.id),
            "delay": delay_full,
            "finish": game_question.order + 1 >= session.total_questions,
            "marker": marker,
        }


def claim_bot_schedule(member_id):
    """Vrni načrt botov za trenutno vprašanje; samo prvi klic zmaga (brez dvojnih odgovorov)."""
    with transaction.atomic():
        member, room, session = _lock(member_id)
        if session is None or session.status != "active" or session.mode != MODE_MULTIPLAYER:
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
        for bot in _alive_members(session):
            if not bot.is_bot:
                continue
            if _answer_for(game_question, bot) is not None:
                continue
            profile = bot.bot_profile
            delay_min = float(profile.delay_min) if profile else float(site_get("bot_delay_min"))
            delay_max = float(profile.delay_max) if profile else float(site_get("bot_delay_max"))
            delay_max = min(delay_max, max(delay_min + 0.1, session.time_limit_seconds * 0.7))
            delay = random.uniform(delay_min, max(delay_min, delay_max))
            accuracy = float(profile.accuracy) if profile else float(site_get("bot_accuracy"))
            plans.append(
                {
                    "member_id": str(bot.id),
                    "delay": delay,
                    "message": _bot_answer_message(game_question, accuracy=accuracy),
                }
            )
        return plans


def _host_id(session):
    host = session.room.members.filter(left_at__isnull=True, is_host=True).first()
    return str(host.id) if host else None


def question_payload(session, game_question, member, message_type="question"):
    base = question_message(session, game_question, message_type)
    base["mode"] = MODE_MULTIPLAYER
    base["prize_ladder"] = []
    base["stake"] = None
    base["next_stake"] = None
    base["can_walk_away"] = False
    base["lifelines"] = {}
    base["active_helps"] = {}
    base["standings"] = standings(session)
    base["you"] = player_stats(session, member)
    base["answered_count"] = game_question.answers.count()
    base["player_count"] = len(_alive_members(session))
    base["sudden_death"] = bool((session.state or {}).get("sudden_death"))
    base["alive_count"] = len(_alive_ids(session))
    base["host_member_id"] = _host_id(session)
    return base


def waiting_answers_message(session, game_question, member, message_type="answer_progress"):
    alive = _alive_members(session)
    waiting = [item for item in alive if _answer_for(game_question, item) is None]
    answered = [item for item in alive if _answer_for(game_question, item) is not None]
    return {
        "type": message_type,
        # Shared broadcast: ostali igralci ostanejo na vprašanju; klient sam preklopi, če je že odgovoril.
        "phase": "answer_progress",
        "mode": MODE_MULTIPLAYER,
        "index": game_question.order,
        "total": session.total_questions,
        "question": public_question(game_question),
        "deadline_at": official_end(game_question, session).isoformat(),
        "server_now": timezone.now().isoformat(),
        "time_limit_seconds": session.time_limit_seconds,
        "answered_count": len(answered),
        "player_count": len(alive),
        "standings": standings(session),
        "sudden_death": bool((session.state or {}).get("sudden_death")),
        "host_member_id": _host_id(session),
        "answered_ids": [str(item.id) for item in answered],
        "waiting_for_ids": [str(item.id) for item in waiting],
        "waiting_for": [item.nickname_in_room for item in waiting],
    }


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
            "points": answer.points,
            "time_taken_ms": answer.time_taken_ms,
            "round_bonus": bool(data.get("round_bonus")),
            "streak_bonus": int(data.get("streak_bonus") or 0),
            "catchup_bonus": int(data.get("catchup_bonus") or 0),
            "member_id": mid,
            "eliminated": bool(data.get("eliminated")),
        }
        row.update(_selected(answer))
        rows.append(row)
    is_last = game_question.order + 1 >= session.total_questions
    host_id = _host_id(session)
    body = {
        "type": message_type,
        "phase": "round_review",
        "mode": MODE_MULTIPLAYER,
        "index": game_question.order,
        "total": session.total_questions,
        "question": public_question(game_question),
        "explanation": game_question.question.explanation,
        "answers": rows,
        "standings": standings(session),
        "you": player_stats(session, member),
        "is_last": is_last,
        "is_host": member.is_host,
        "host_member_id": host_id,
        "advance_seconds": int(site_get("mp_round_advance_seconds")),
        "sudden_death": bool((session.state or {}).get("sudden_death")),
        "alive_count": len(_alive_ids(session)),
        "server_now": timezone.now().isoformat(),
    }
    body.update(_reveal(game_question))
    return body


def broadcast_round_review(session, game_question):
    host = session.room.members.filter(left_at__isnull=True, is_host=True).first()
    member = host or session.room.members.filter(left_at__isnull=True).first()
    return [round_review_message(session, game_question, member)]


def finished_multiplayer(session, member):
    from game.replay import result_id_for

    payload = {
        "type": "game_finished",
        "phase": "finished",
        "finished": True,
        "mode": MODE_MULTIPLAYER,
        "standings": standings(session),
        "you": player_stats(session, member),
        "reason": (session.state or {}).get("reason") or "completed",
        "total": session.total_questions,
        "total_questions": session.total_questions,
        "nickname": member.nickname_in_room,
        "score": player_stats(session, member).get("score", 0),
        "sudden_death": bool((session.state or {}).get("sudden_death")),
        "host_member_id": _host_id(session),
    }
    rid = result_id_for(session, member=member)
    if rid:
        payload["result_id"] = rid
    return payload


def finalize_multiplayer(session, room, reason="completed"):
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
            mode=MODE_MULTIPLAYER,
            score=int(stats.get("score") or 0),
            prize_reached=0,
            speed_bonus=int(stats.get("speed_bonus_total") or 0),
            correct_count=int(stats.get("correct_count") or 0),
            total_questions=session.total_questions,
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
    payload = finished_multiplayer(session, host)
    payload["result_ids"] = result_ids
    if str(host.id) in result_ids:
        payload["result_id"] = result_ids[str(host.id)]
    return [payload]


def standings(session):
    players = (session.state or {}).get("players") or {}
    alive = set(_alive_ids(session))
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
                "correct_count": int(stats.get("correct_count") or 0),
                "round_bonuses": int(stats.get("round_bonuses") or 0),
                "streak": int(stats.get("streak") or 0),
                "alive": member_id in alive if alive else True,
                "is_bot": bool(stats.get("is_bot")),
            }
        )
    rows.sort(key=lambda item: (-item["alive"], -item["score"], -item["correct_count"], item["nickname"]))
    for index, row in enumerate(rows, start=1):
        row["rank"] = index
    return rows


def player_stats(session, member):
    players = (session.state or {}).get("players") or {}
    stats = dict(players.get(str(member.id)) or {})
    stats["member_id"] = str(member.id)
    stats["alive"] = _is_alive(session, member)
    return stats


def _alive_ids(session):
    state = session.state or {}
    alive = state.get("alive")
    if alive is None:
        return [str(item.id) for item in session.room.members.filter(left_at__isnull=True)]
    return list(alive)


def _alive_members(session):
    ids = set(_alive_ids(session))
    return [item for item in session.room.members.filter(left_at__isnull=True) if str(item.id) in ids]


def _is_alive(session, member):
    return str(member.id) in set(_alive_ids(session))


def _round_complete(session, game_question):
    active = _alive_members(session)
    if not active:
        return True
    return game_question.answers.filter(room_member_id__in=[item.id for item in active]).count() >= len(active)


def _should_force_timeout_round(session, game_question):
    return game_question.started_at is not None and timezone.now() > hard_end(game_question, session)


def _apply_timeouts(session, game_question):
    now = timezone.now()
    for member in _alive_members(session):
        if _answer_for(game_question, member) is not None:
            continue
        elapsed = max(0, int((now - game_question.started_at).total_seconds() * 1000)) if game_question.started_at else 0
        PlayerAnswer.objects.create(
            game_question=game_question,
            room_member=member,
            answer_data={"timeout": True},
            is_correct=False,
            answered_at=now,
            time_taken_ms=elapsed,
            points=0,
        )
        _reset_streak(session, member)
    if game_question.ended_at is None:
        game_question.ended_at = now
        game_question.save(update_fields=["ended_at"])


def _reset_streak(session, member):
    state = dict(session.state or {})
    players = dict(state.get("players") or {})
    key = str(member.id)
    stats = dict(players.get(key) or {})
    stats["streak"] = 0
    players[key] = stats
    state["players"] = players
    session.state = state
    session.save(update_fields=["state"])


def _award_round_bonus(session, game_question):
    state = dict(session.state or {})
    if state.get("round_bonus_awarded"):
        return
    correct = [
        answer
        for answer in game_question.answers.select_related("room_member")
        if answer.is_correct and _is_alive(session, answer.room_member)
    ]
    if correct:
        winner = min(correct, key=lambda item: (item.time_taken_ms or 10**9, item.answered_at or timezone.now()))
        data = dict(winner.answer_data or {})
        data["round_bonus"] = True
        winner.answer_data = data
        winner.points = int(winner.points or 0) + int(site_get("mp_round_bonus"))
        winner.save(update_fields=["answer_data", "points"])
        players = dict(state.get("players") or {})
        key = str(winner.room_member_id)
        stats = dict(players.get(key) or {})
        stats["score"] = int(stats.get("score") or 0) + int(site_get("mp_round_bonus"))
        stats["round_bonuses"] = int(stats.get("round_bonuses") or 0) + int(site_get("mp_round_bonus"))
        players[key] = stats
        state["players"] = players
    state["round_bonus_awarded"] = True
    session.state = state
    session.save(update_fields=["state"])


def _award_catchup_bonus(session, game_question):
    """Najnižji pravilni v rundi (ki ni bil sam vodilni) dobi catch-up bonus."""
    state = dict(session.state or {})
    if state.get("catchup_awarded_for") == str(game_question.id):
        return
    players = dict(state.get("players") or {})
    alive = _alive_members(session)
    if len(alive) < 2:
        state["catchup_awarded_for"] = str(game_question.id)
        session.state = state
        session.save(update_fields=["state"])
        return
    scores = {str(item.id): int((players.get(str(item.id)) or {}).get("score") or 0) for item in alive}
    answers = list(game_question.answers.select_related("room_member"))
    by_member = {str(answer.room_member_id): answer for answer in answers}

    def pre_score(member_id):
        answer = by_member.get(member_id)
        current = int(scores.get(member_id) or 0)
        if answer is None:
            return current
        return current - int(answer.points or 0)

    max_pre = max((pre_score(str(item.id)) for item in alive), default=0)
    correct = [answer for answer in answers if answer.is_correct and str(answer.room_member_id) in scores]
    if not correct:
        state["catchup_awarded_for"] = str(game_question.id)
        session.state = state
        session.save(update_fields=["state"])
        return
    trailing = [answer for answer in correct if pre_score(str(answer.room_member_id)) < max_pre]
    if not trailing:
        state["catchup_awarded_for"] = str(game_question.id)
        session.state = state
        session.save(update_fields=["state"])
        return
    winner = min(
        trailing,
        key=lambda item: (pre_score(str(item.room_member_id)), item.time_taken_ms or 10**9),
    )
    data = dict(winner.answer_data or {})
    if data.get("catchup_bonus"):
        state["catchup_awarded_for"] = str(game_question.id)
        session.state = state
        session.save(update_fields=["state"])
        return
    data["catchup_bonus"] = int(site_get("mp_catchup_bonus"))
    winner.answer_data = data
    winner.points = int(winner.points or 0) + int(site_get("mp_catchup_bonus"))
    winner.save(update_fields=["answer_data", "points"])
    key = str(winner.room_member_id)
    stats = dict(players.get(key) or {})
    stats["score"] = int(stats.get("score") or 0) + int(site_get("mp_catchup_bonus"))
    stats["catchup_bonus_total"] = int(stats.get("catchup_bonus_total") or 0) + int(site_get("mp_catchup_bonus"))
    players[key] = stats
    state["players"] = players
    state["catchup_awarded_for"] = str(game_question.id)
    session.state = state
    session.save(update_fields=["state"])


def _apply_sudden_death(session, game_question):
    state = dict(session.state or {})
    if not state.get("sudden_death"):
        return None
    previous = list(state.get("alive") or _alive_ids(session))
    remaining = []
    for member_id in previous:
        answer = game_question.answers.filter(room_member_id=member_id).first()
        if answer is not None and answer.is_correct:
            remaining.append(member_id)
        elif answer is not None:
            data = dict(answer.answer_data or {})
            data["eliminated"] = True
            answer.answer_data = data
            answer.save(update_fields=["answer_data"])
            players = dict(state.get("players") or {})
            stats = dict(players.get(member_id) or {})
            stats["alive"] = False
            stats["streak"] = 0
            players[member_id] = stats
            state["players"] = players
    if not remaining:
        # Vsi narobe → nihče ne izpade to rundo.
        remaining = previous
    state["alive"] = remaining
    session.state = state
    session.save(update_fields=["state"])
    if len(remaining) == 1:
        return finalize_multiplayer(session, session.room, reason="sudden_death")
    return None


def _store_answer(member, session, game_question, message):
    now = timezone.now()
    if game_question.started_at is None:
        raise GameError("Vprašanje še ni začeto.")
    official = official_end(game_question, session)
    hard = hard_end(game_question, session)
    wants_timeout = bool(message.get("timeout"))
    # Ljudje ne smejo oddati timeout pred uradnim koncem; boti vedno oddajo (fallback).
    if wants_timeout and now < official and not member.is_bot:
        return None
    timed_out = wants_timeout or now > hard
    if timed_out:
        is_correct = False
        answer_data = {"timeout": True}
        selected = None
        bonus = 0
        main = 0
        streak_bonus = 0
    else:
        presentation = ensure_presentation(game_question)
        is_correct = grade_answer(game_question.question, message, presentation)
        answer_data = _stored_answer(message)
        selected = _selected_option(game_question, message)
        bonus = speed_bonus(
            max(0, int((now - game_question.started_at).total_seconds() * 1000)),
            session.time_limit_seconds,
        ) if is_correct else 0
        main = int(site_get("mp_correct_points")) if is_correct else 0
        streak_bonus = 0
    elapsed = max(0, int((now - game_question.started_at).total_seconds() * 1000))
    state = dict(session.state or {})
    players = dict(state.get("players") or {})
    key = str(member.id)
    stats = dict(players.get(key) or {"nickname": member.nickname_in_room, "color": member.color})
    streak = int(stats.get("streak") or 0)
    if is_correct:
        streak += 1
        if streak >= 3:
            streak_bonus = int(site_get("mp_streak_bonus_3"))
        elif streak >= 2:
            streak_bonus = int(site_get("mp_streak_bonus_2"))
        stats["streak"] = streak
        if streak_bonus:
            answer_data["streak_bonus"] = streak_bonus
            stats["streak_bonus_total"] = int(stats.get("streak_bonus_total") or 0) + streak_bonus
    else:
        stats["streak"] = 0
    points = main + bonus + streak_bonus
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
    if is_correct:
        stats["correct_count"] = int(stats.get("correct_count") or 0) + 1
        stats["main_points"] = int(stats.get("main_points") or 0) + main
        stats["speed_bonus_total"] = int(stats.get("speed_bonus_total") or 0) + bonus
        stats["score"] = int(stats.get("score") or 0) + points
    players[key] = stats
    state["players"] = players
    session.state = state
    session.save(update_fields=["state"])
    return True


def _bot_answer_message(game_question, accuracy=None):
    """Vedno vrne veljaven submit (brez zgodnjega timeout), za vse tipe vprašanj."""
    question = game_question.question
    presentation = ensure_presentation(game_question)
    # Če se tip in presentation ne ujemata (npr. zamenjava v testih), zgradi na novo.
    if question.question_type == Question.Type.MATCHING and not (presentation or {}).get("links"):
        game_question.presentation = {}
        game_question.save(update_fields=["presentation"])
        presentation = ensure_presentation(game_question)
    qid = str(game_question.id)
    chance = float(site_get("bot_accuracy")) if accuracy is None else float(accuracy)
    want_correct = random.random() < chance
    options = list(question.options.all())

    if question.question_type in SINGLE_TYPES:
        correct = [opt.id for opt in options if opt.is_correct]
        wrong = [opt.id for opt in options if not opt.is_correct]
        if want_correct and correct:
            pick = random.choice(correct)
        elif wrong:
            pick = random.choice(wrong)
        elif options:
            pick = options[0].id
        else:
            return {"type": "submit_answer", "game_question_id": qid, "timeout": True}
        return {"type": "submit_answer", "game_question_id": qid, "option_id": pick}

    if question.question_type == Question.Type.MULTI_SELECT:
        correct = [opt.id for opt in options if opt.is_correct]
        wrong = [opt.id for opt in options if not opt.is_correct]
        if want_correct and correct:
            ids = list(correct)
        elif correct and wrong:
            ids = [correct[0], wrong[0]] if wrong else correct[:-1] or correct
        elif options:
            ids = [options[0].id]
        else:
            return {"type": "submit_answer", "game_question_id": qid, "timeout": True}
        return {"type": "submit_answer", "game_question_id": qid, "option_ids": ids}

    if question.question_type == Question.Type.ORDERING:
        correct_ids = [opt.id for opt in sorted(options, key=lambda item: (item.order, item.id))]
        if not correct_ids:
            return {"type": "submit_answer", "game_question_id": qid, "timeout": True}
        ids = list(correct_ids)
        if not want_correct and len(ids) > 1:
            random.shuffle(ids)
            if ids == correct_ids:
                ids[0], ids[1] = ids[1], ids[0]
        return {"type": "submit_answer", "game_question_id": qid, "option_ids": ids}

    if question.question_type == Question.Type.MATCHING:
        links = list(presentation.get("links") or [])
        if not links:
            return {"type": "submit_answer", "game_question_id": qid, "timeout": True}
        if want_correct:
            pairs = [{"left_id": link["left_id"], "right_id": link["right_id"]} for link in links]
        else:
            rights = [link["right_id"] for link in links]
            random.shuffle(rights)
            pairs = [{"left_id": link["left_id"], "right_id": right} for link, right in zip(links, rights)]
            expected = {link["left_id"]: link["right_id"] for link in links}
            if all(pair["right_id"] == expected[pair["left_id"]] for pair in pairs) and len(pairs) > 1:
                pairs[0], pairs[1] = (
                    {"left_id": pairs[0]["left_id"], "right_id": pairs[1]["right_id"]},
                    {"left_id": pairs[1]["left_id"], "right_id": pairs[0]["right_id"]},
                )
        return {"type": "submit_answer", "game_question_id": qid, "pairs": pairs}

    if question.question_type == Question.Type.SLIDER:
        config = question.config or {}
        try:
            correct_value = float(config["correct"])
            minimum = float(config["min"])
            maximum = float(config["max"])
            tolerance = float(config.get("tolerance") or 0)
            step = float(config.get("step") or 1) or 1
        except (KeyError, TypeError, ValueError):
            return {"type": "submit_answer", "game_question_id": qid, "timeout": True}
        if want_correct:
            value = correct_value
        else:
            value = correct_value
            for _ in range(20):
                candidate = minimum + random.randint(0, max(0, int((maximum - minimum) / step))) * step
                if abs(candidate - correct_value) > tolerance + 1e-9:
                    value = candidate
                    break
            else:
                value = minimum if abs(minimum - correct_value) > tolerance else maximum
        return {"type": "submit_answer", "game_question_id": qid, "value": value}

    return {"type": "submit_answer", "game_question_id": qid, "timeout": True}
