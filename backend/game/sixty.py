"""Solo način 60 sekund: skupni časovni bazen, +2/−5/−2, skipi, težavnost po elapsed."""

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
    _selected_option,
    _stored_answer,
    grade_answer,
)
from game.modes import MODE_60_SEKUND, SIXTY_DIFFICULTY_BANDS, SIXTY_QUESTION_TYPES
from game.models import GameQuestion, GameResult, GameSession, PlayerAnswer
from game.presentation import ensure_presentation, public_question
from game.site_settings import get as site_get
from questions.models import Question


def snapshot_sixty(member_id):
    with transaction.atomic():
        member, room, session = _lock(member_id, include_finished=True)
        if session is None:
            return {"type": "game_state", "phase": "waiting"}
        if session.status == "active":
            _expire_clock_if_due(member, room, session)
            session.refresh_from_db()
        if session.status == "finished":
            return finished_payload(session, member)
        game_question = _current(session)
        answer = _answer_for(game_question, member)
        if answer is not None:
            # Med flash in naslednjim Q ne bi smelo ostati; snapshot vrne naslednje ali finish.
            return finished_payload(session, member) if session.status == "finished" else question_payload(
                session, game_question, "game_state"
            )
        return question_payload(session, game_question, "game_state")


def start_sixty(member_id):
    with transaction.atomic():
        member, room, session = _lock(member_id)
        if not member.is_host:
            raise GameError("Samo gostitelj lahko začne igro.")
        if session is not None:
            return [snapshot_sixty(member_id)]
        if room.status != "waiting":
            raise GameError("Igre ni mogoče začeti.")
        settings = room.settings or {}
        now = timezone.now()
        skip_limit = settings.get("skip_limit")
        skips_left = None if skip_limit is None else int(skip_limit)
        clock_ends = now + timedelta(seconds=int(site_get("sixty_start_seconds")))
        session = GameSession.objects.create(
            room=room,
            mode=MODE_60_SEKUND,
            status="active",
            total_questions=1,
            current_question_index=0,
            time_limit_seconds=int(site_get("sixty_start_seconds")),
            state={
                "clock_ends_at": clock_ends.isoformat(),
                "clock_cap": int(site_get("sixty_clock_cap")),
                "skips_left": skips_left,
                "skip_limit": skip_limit,
                "correct_count": 0,
                "answered_count": 0,
                "score": 0,
                "reason": "",
                "used_question_ids": [],
                "difficulty_profile": settings.get("difficulty_profile") or "normal",
                "categories": list(settings.get("categories") or []),
            },
            started_at=now,
        )
        game_question = _append_question(session, now)
        room.status = "playing"
        room.started_at = now
        room.last_activity = now
        room.save(update_fields=["status", "started_at", "last_activity"])
        return [question_payload(session, game_question, "game_started")]


def submit_sixty(member_id, message):
    if not isinstance(message, dict):
        raise GameError("Neveljavno sporočilo.")
    with transaction.atomic():
        member, room, session = _lock(member_id)
        if session is None or session.status != "active":
            if session is not None and session.status == "finished":
                return [finished_payload(session, member)]
            raise GameError("Igra ni aktivna.")
        _expire_clock_if_due(member, room, session)
        session.refresh_from_db()
        if session.status == "finished":
            return [finished_payload(session, member)]
        game_question = _current(session)
        if str(message.get("game_question_id")) != str(game_question.id):
            raise GameError("To vprašanje ni aktivno.")
        if _answer_for(game_question, member) is not None:
            raise GameError("Že si odgovoril.")
        if bool(message.get("skip")):
            return _resolve(member, room, session, game_question, skipped=True, message=message)
        if bool(message.get("timeout")):
            ends = _clock_ends(session)
            if ends is None or timezone.now() < ends:
                raise GameError("Čas še teče.")
            return _finish_clock(member, room, session)
        return _resolve(member, room, session, game_question, skipped=False, message=message)


def apply_sixty_timeout(member_id, game_question_id):
    with transaction.atomic():
        member, room, session = _lock(member_id)
        if session is None or session.status != "active":
            return []
        game_question = _current(session)
        if str(game_question.id) != str(game_question_id):
            return []
        if _answer_for(game_question, member) is not None:
            return []
        ends = _clock_ends(session)
        if ends is None or timezone.now() < ends:
            return []
        return _finish_clock(member, room, session)


def seconds_until_sixty_deadline(game_question_id):
    try:
        game_question = GameQuestion.objects.select_related("game_session").get(pk=game_question_id)
    except GameQuestion.DoesNotExist:
        return None
    session = game_question.game_session
    if session.status != "active" or session.mode != MODE_60_SEKUND:
        return None
    if game_question.order != session.current_question_index:
        return None
    ends = _clock_ends(session)
    if ends is None:
        return None
    return (ends - timezone.now()).total_seconds()


def question_payload(session, game_question, message_type="question"):
    state = dict(session.state or {})
    ends = _clock_ends(session)
    now = timezone.now()
    remaining = max(0, int((ends - now).total_seconds() * 1000)) if ends else 0
    return {
        "type": message_type,
        "phase": "question",
        "mode": MODE_60_SEKUND,
        "question": public_question(game_question),
        "index": game_question.order,
        "total": None,
        "correct_count": int(state.get("correct_count") or 0),
        "answered_count": int(state.get("answered_count") or 0),
        "score": int(state.get("score") or 0),
        "skips_left": state.get("skips_left"),
        "skip_limit": state.get("skip_limit"),
        "clock_ends_at": state.get("clock_ends_at"),
        "deadline_at": state.get("clock_ends_at"),
        "server_now": now.isoformat(),
        "clock_remaining_ms": remaining,
        "time_limit_seconds": int(site_get("sixty_start_seconds")),
        "prize_ladder": [],
        "lifelines": {},
        "active_helps": {},
    }


def finished_payload(session, member):
    from game.replay import result_id_for

    state = dict(session.state or {})
    duration = None
    if session.started_at and session.finished_at:
        duration = max(0, int((session.finished_at - session.started_at).total_seconds() * 1000))
    elif session.started_at:
        duration = max(0, int((timezone.now() - session.started_at).total_seconds() * 1000))
    now = timezone.now()
    # Pošlji tudi uro = zdaj, da klient ne obdrži starega clock_ends_at in še šteje.
    clock_end = state.get("clock_ends_at") or now.isoformat()
    payload = {
        "type": "game_finished",
        "phase": "finished",
        "finished": True,
        "mode": MODE_60_SEKUND,
        "reason": state.get("reason") or "timeout",
        "score": int(state.get("score") or 0),
        "correct_count": int(state.get("correct_count") or 0),
        "answered_count": int(state.get("answered_count") or 0),
        "total_questions": int(state.get("answered_count") or 0),
        "total": int(state.get("answered_count") or 0),
        "duration_ms": duration,
        "nickname": member.nickname_in_room,
        "prize_ladder": [],
        "clock_ends_at": clock_end,
        "deadline_at": clock_end,
        "clock_remaining_ms": 0,
        "server_now": now.isoformat(),
    }
    rid = result_id_for(session, member=member)
    if rid:
        payload["result_id"] = rid
    return payload


def _resolve(member, room, session, game_question, skipped, message):
    now = timezone.now()
    state = dict(session.state or {})
    ends = _clock_ends(session)
    if ends is not None and now >= ends:
        return _finish_clock(member, room, session)

    is_correct = False
    answer_data = {}
    selected = None
    time_delta = 0

    if skipped:
        skips = state.get("skips_left")
        if skips is not None and int(skips) <= 0:
            raise GameError("Nimaš več preskokov.")
        if skips is not None:
            state["skips_left"] = int(skips) - 1
        time_delta = -int(site_get("sixty_skip_penalty"))
        answer_data = {"skip": True}
        is_correct = False
    else:
        presentation = ensure_presentation(game_question)
        is_correct = grade_answer(game_question.question, message, presentation)
        answer_data = _stored_answer(message)
        selected = _selected_option(game_question, message)
        time_delta = (
            int(site_get("sixty_correct_bonus")) if is_correct else -int(site_get("sixty_wrong_penalty"))
        )

    elapsed_ms = 0
    if game_question.started_at:
        elapsed_ms = max(0, int((now - game_question.started_at).total_seconds() * 1000))
    PlayerAnswer.objects.create(
        game_question=game_question,
        room_member=member,
        selected_option=selected,
        answer_data=answer_data,
        is_correct=None if skipped else is_correct,
        answered_at=now,
        time_taken_ms=elapsed_ms,
        points=0,
    )
    game_question.ended_at = now
    game_question.save(update_fields=["ended_at"])

    state["answered_count"] = int(state.get("answered_count") or 0) + 1
    if is_correct and not skipped:
        state["correct_count"] = int(state.get("correct_count") or 0) + 1
        state["score"] = state["correct_count"]

    new_ends = _adjust_clock(
        ends or now, time_delta, int(state.get("clock_cap") or site_get("sixty_clock_cap")), now
    )
    state["clock_ends_at"] = new_ends.isoformat()
    session.state = state
    session.save(update_fields=["state"])

    feedback = {
        "is_correct": None if skipped else bool(is_correct),
        "skipped": bool(skipped),
        "time_delta": time_delta,
        "label": _feedback_label(skipped, is_correct, time_delta),
    }

    if new_ends <= now:
        state["reason"] = "timeout"
        session.state = state
        _finalize(session, room, member, "timeout", now)
        done = finished_payload(session, member)
        done["feedback"] = feedback
        return [done]

    nxt = _append_question(session, now)
    payload = question_payload(session, nxt, "question")
    payload["feedback"] = feedback
    return [payload]


def _finish_clock(member, room, session):
    now = timezone.now()
    state = dict(session.state or {})
    state["reason"] = "timeout"
    state["clock_ends_at"] = now.isoformat()
    session.state = state
    _finalize(session, room, member, "timeout", now)
    return [finished_payload(session, member)]


def _finalize(session, room, member, reason, now):
    session.status = "finished"
    session.finished_at = now
    state = dict(session.state or {})
    state["reason"] = reason
    session.state = state
    session.total_questions = int(state.get("answered_count") or 0)
    session.save(update_fields=["status", "finished_at", "state", "total_questions"])
    room.status = "finished"
    room.finished_at = now
    room.last_activity = now
    room.save(update_fields=["status", "finished_at", "last_activity"])
    duration = None
    if session.started_at:
        duration = max(0, int((now - session.started_at).total_seconds() * 1000))
    GameResult.objects.get_or_create(
        game_session=session,
        defaults={
            "user": member.user,
            "nickname": member.nickname_in_room,
            "mode": MODE_60_SEKUND,
            "score": int(state.get("score") or 0),
            "prize_reached": 0,
            "speed_bonus": 0,
            "correct_count": int(state.get("correct_count") or 0),
            "total_questions": int(state.get("answered_count") or 0),
            "duration_ms": duration,
            "is_guest": bool(getattr(member.user, "is_guest", True)) if member.user_id else True,
            "reason": reason,
            "room_code": room.code,
        },
    )


def _expire_clock_if_due(member, room, session):
    if session.status != "active":
        return
    ends = _clock_ends(session)
    if ends is None or timezone.now() < ends:
        return
    _finish_clock(member, room, session)


def _append_question(session, now):
    state = dict(session.state or {})
    used = set(state.get("used_question_ids") or [])
    question = _pick_question(session, used)
    if question is None:
        raise GameError("Zmanjkalo je vprašanj v izbranih kategorijah.")
    used.add(question.id)
    state["used_question_ids"] = list(used)
    order = session.current_question_index if session.game_questions.exists() else 0
    if session.game_questions.exists():
        order = session.current_question_index + 1
        session.current_question_index = order
        session.total_questions = order + 1
        session.state = state
        session.save(update_fields=["current_question_index", "total_questions", "state"])
    else:
        session.state = state
        session.save(update_fields=["state"])
    return GameQuestion.objects.create(
        game_session=session,
        question=question,
        order=order,
        started_at=now,
    )


def _pick_question(session, used):
    state = dict(session.state or {})
    slugs = state.get("categories") or []
    profile = state.get("difficulty_profile") or "normal"
    elapsed = 0
    if session.started_at:
        elapsed = max(0, int((timezone.now() - session.started_at).total_seconds()))
    min_d, max_d = _difficulty_band(profile, elapsed)
    base = Question.objects.filter(
        category__slug__in=slugs,
        is_active=True,
        question_type__in=SIXTY_QUESTION_TYPES,
    ).exclude(id__in=used)
    candidates = list(base.filter(difficulty__gte=min_d, difficulty__lte=max_d)[:80])
    if not candidates:
        # Razširi pas: najbližje težavnosti.
        all_left = list(base[:120])
        if not all_left:
            return None
        target = (min_d + max_d) / 2
        all_left.sort(key=lambda q: (abs(q.difficulty - target), random.random()))
        return all_left[0]
    return random.choice(candidates)


def _difficulty_band(profile, elapsed_seconds):
    bands = SIXTY_DIFFICULTY_BANDS.get(profile) or SIXTY_DIFFICULTY_BANDS["normal"]
    for max_elapsed, min_d, max_d in bands:
        if elapsed_seconds <= max_elapsed:
            return min_d, max_d
    return 5, 5


def _clock_ends(session):
    raw = (session.state or {}).get("clock_ends_at")
    if not raw:
        return None
    if hasattr(raw, "isoformat"):
        return raw
    return parse_datetime(str(raw))


def _adjust_clock(ends, delta_seconds, cap_seconds, now):
    new_ends = ends + timedelta(seconds=delta_seconds)
    if new_ends < now:
        return now
    max_ends = now + timedelta(seconds=cap_seconds)
    if new_ends > max_ends:
        return max_ends
    return new_ends


def _feedback_label(skipped, is_correct, time_delta):
    sign = f"+{time_delta} s" if time_delta > 0 else f"{time_delta} s"
    if skipped:
        return f"Preskok · {sign}"
    if is_correct:
        return f"Pravilno · {sign}"
    return f"Napačno · {sign}"
