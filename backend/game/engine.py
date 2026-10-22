import random
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from game.models import GameQuestion, GameResult, GameSession, PlayerAnswer
from game.presentation import ensure_presentation, public_question
from questions.models import Category, Question
from rooms.models import Room, RoomMember

PRIZE_LADDER = [
    100,
    200,
    300,
    500,
    1_000,
    2_000,
    4_000,
    8_000,
    16_000,
    32_000,
    64_000,
    125_000,
    250_000,
    500_000,
    1_000_000,
]
GRACE = timedelta(milliseconds=1500)
MAX_SPEED_BONUS = 100
ALLOWED_TIMES = {10, 15, 20, 30, 45, 60}
SINGLE_TYPES = {Question.Type.MULTIPLE_CHOICE, Question.Type.TRUE_FALSE}


class GameError(Exception):
    def __init__(self, message):
        self.message = message
        super().__init__(message)


def ladder_for(total):
    return PRIZE_LADDER[:total]


def speed_bonus(time_taken_ms, time_limit_seconds):
    limit_ms = time_limit_seconds * 1000
    taken = max(0, time_taken_ms)
    if taken >= limit_ms:
        return 0
    return round(((limit_ms - taken) / limit_ms) * MAX_SPEED_BONUS)


def official_end(game_question, session):
    return game_question.started_at + timedelta(seconds=session.time_limit_seconds)


def hard_end(game_question, session):
    return official_end(game_question, session) + GRACE


def validate_settings(raw):
    if not isinstance(raw, dict):
        raise GameError("Nastavitve niso veljavne.")
    if raw.get("mode") not in (None, "", "millionaire"):
        raise GameError("Za zdaj je na voljo samo milijonar.")
    try:
        count = int(raw.get("question_count", 10))
        seconds = int(raw.get("time_limit_seconds", 20))
    except (TypeError, ValueError):
        raise GameError("Število vprašanj in čas morata biti števili.")
    if not 5 <= count <= 15:
        raise GameError("Število vprašanj mora biti med 5 in 15.")
    if seconds not in ALLOWED_TIMES:
        raise GameError("Čas na vprašanje je 10, 15, 20, 30, 45 ali 60 sekund.")
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
    available = Question.objects.filter(category__slug__in=cleaned, is_active=True).count()
    if available < count:
        raise GameError(f"Na voljo je {available} vprašanj, izbral si jih {count}.")
    return {
        "mode": "millionaire",
        "question_count": count,
        "categories": cleaned,
        "time_limit_seconds": seconds,
        "difficulty_progression": "increasing",
    }


def select_questions(slugs, count, progression="increasing"):
    questions = list(Question.objects.filter(category__slug__in=slugs, is_active=True).select_related("category"))
    if len(questions) < count:
        raise GameError(f"Na voljo je {len(questions)} vprašanj, izbral si jih {count}.")
    if progression != "increasing":
        return random.sample(questions, count)

    buckets = {level: [] for level in range(1, 6)}
    for question in questions:
        level = min(5, max(1, question.difficulty))
        buckets[level].append(question)
    for bucket in buckets.values():
        random.shuffle(bucket)

    if count == 1:
        targets = [3]
    else:
        targets = [min(5, max(1, round(1 + index * 4 / (count - 1)))) for index in range(count)]

    chosen = []
    used = set()
    for target in targets:
        pick = _take_nearest(buckets, target, used)
        if pick is None:
            raise GameError("Ni dovolj vprašanj za izbrano težavnost.")
        chosen.append(pick)
        used.add(pick.id)
    return chosen


def grade_answer(question, data, presentation=None):
    question_type = question.question_type
    options = list(question.options.all())
    if question_type in SINGLE_TYPES:
        option_id = _as_int(data.get("option_id"))
        match = next((option for option in options if option.id == option_id), None)
        if match is None:
            raise GameError("Neveljavna možnost.")
        return match.is_correct
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
        known = {option.id for option in options}
        if not set(ids) <= known:
            raise GameError("Neveljavna možnost.")
        correct = {option.id for option in options if option.is_correct}
        return set(ids) == correct
    if question_type == Question.Type.ORDERING:
        raw_ids = data.get("option_ids")
        if not isinstance(raw_ids, list):
            raise GameError("Razvrsti vse možnosti.")
        ids = [_as_int(raw) for raw in raw_ids]
        if any(value is None for value in ids):
            raise GameError("Neveljaven vrstni red.")
        correct_ids = [option.id for option in sorted(options, key=lambda option: (option.order, option.id))]
        if sorted(ids) != sorted(correct_ids):
            raise GameError("Neveljaven vrstni red.")
        return ids == correct_ids
    if question_type == Question.Type.MATCHING:
        pairs = data.get("pairs")
        links = (presentation or {}).get("links") or []
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
        config = question.config or {}
        raw_value = data.get("value")
        if isinstance(raw_value, bool) or not isinstance(raw_value, (int, float)):
            raise GameError("Nastavi vrednost.")
        value = float(raw_value)
        minimum = float(config["min"])
        maximum = float(config["max"])
        if value < minimum or value > maximum:
            raise GameError("Vrednost je zunaj obsega.")
        return abs(value - float(config["correct"])) <= float(config["tolerance"]) + 1e-9
    raise GameError("Neznan tip vprašanja.")


def member_id_for(user_id, code):
    member = RoomMember.objects.filter(user_id=user_id, room__code=code).order_by("-joined_at").first()
    return member.id if member else None


def set_member_connected(member_id, connected):
    RoomMember.objects.filter(pk=member_id).update(is_connected=connected)


def snapshot(member_id):
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
    with transaction.atomic():
        member, room, session = _lock(member_id)
        if not member.is_host:
            raise GameError("Samo gostitelj lahko začne igro.")
        created = False
        if session is None:
            if room.status != "waiting":
                raise GameError("Igre ni mogoče začeti.")
            settings = room.settings or {}
            questions = select_questions(
                settings.get("categories") or [],
                int(settings.get("question_count") or 10),
                settings.get("difficulty_progression") or "increasing",
            )
            now = timezone.now()
            session = GameSession.objects.create(
                room=room,
                mode="millionaire",
                status="active",
                total_questions=len(questions),
                current_question_index=0,
                time_limit_seconds=int(settings.get("time_limit_seconds") or 20),
                state={
                    "prize_ladder": ladder_for(len(questions)),
                    "prize_reached": 0,
                    "speed_bonus_total": 0,
                    "correct_count": 0,
                    "score": 0,
                    "reason": "",
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
            return [result, _finished_copy(result)] if session.status == "finished" else [result]
        return _grade_locked(member, room, session, game_question, message)


def apply_timeout(member_id, game_question_id):
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
        game_question = GameQuestion.objects.select_related("game_session").get(pk=game_question_id)
    except GameQuestion.DoesNotExist:
        return None
    session = game_question.game_session
    if session.status != "active" or game_question.order != session.current_question_index:
        return None
    if game_question.started_at is None or game_question.answers.exists():
        return None
    remaining = (hard_end(game_question, session) - timezone.now()).total_seconds()
    return max(0.0, remaining)


def next_question(member_id):
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
        if session.current_question_index != nxt.order:
            session.current_question_index = nxt.order
            session.save(update_fields=["current_question_index"])
        return [question_message(session, nxt, "question")]


def question_message(session, game_question, message_type):
    state = _state(session)
    ladder = state["prize_ladder"]
    index = game_question.order
    return {
        "type": message_type,
        "phase": "question",
        "question": public_question(game_question),
        "index": index,
        "total": session.total_questions,
        "prize_ladder": ladder,
        "prize_reached": state["prize_reached"],
        "stake": ladder[index] if index < len(ladder) else None,
        "next_stake": ladder[index + 1] if index + 1 < len(ladder) else None,
        "score": state["score"],
        "speed_bonus_total": state["speed_bonus_total"],
        "correct_count": state["correct_count"],
        "deadline_at": official_end(game_question, session).isoformat(),
        "server_now": timezone.now().isoformat(),
        "time_limit_seconds": session.time_limit_seconds,
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
        "is_correct": bool(answer.is_correct),
        "timed_out": bool((answer.answer_data or {}).get("timeout")),
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
    if is_correct:
        state["correct_count"] = state.get("correct_count", 0) + 1
        ladder = state.get("prize_ladder") or ladder_for(session.total_questions)
        state["prize_reached"] = ladder[state["correct_count"] - 1]
        state["speed_bonus_total"] = state.get("speed_bonus_total", 0) + bonus
        state["score"] = state["prize_reached"] + state["speed_bonus_total"]
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
        return [result, _finished_copy(result)]
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
        return {
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
    return _finished_copy(result_message(session, answer.game_question, answer, member))


def _finished_copy(result):
    payload = dict(result)
    payload["type"] = "game_finished"
    payload["phase"] = "finished"
    payload["finished"] = True
    payload["total_questions"] = result.get("total")
    return payload


def _lock(member_id):
    try:
        member = RoomMember.objects.select_related("user").get(pk=member_id)
    except RoomMember.DoesNotExist:
        raise GameError("Soba ne obstaja.")
    room = Room.objects.select_for_update().get(pk=member.room_id)
    session = GameSession.objects.select_for_update().filter(room=room).first()
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
    ladder = state.get("prize_ladder") or ladder_for(session.total_questions)
    return {
        "prize_ladder": ladder,
        "prize_reached": state.get("prize_reached", 0),
        "speed_bonus_total": state.get("speed_bonus_total", 0),
        "correct_count": state.get("correct_count", 0),
        "score": state.get("score", 0),
        "reason": state.get("reason") or "",
    }


def _reveal(game_question):
    question = game_question.question
    presentation = game_question.presentation or {}
    if question.question_type in {
        Question.Type.MULTIPLE_CHOICE,
        Question.Type.TRUE_FALSE,
        Question.Type.MULTI_SELECT,
    }:
        return {"correct_option_ids": [option.id for option in question.options.all() if option.is_correct]}
    if question.question_type == Question.Type.ORDERING:
        ordered = sorted(question.options.all(), key=lambda option: (option.order, option.id))
        return {"correct_option_ids": [option.id for option in ordered]}
    if question.question_type == Question.Type.MATCHING:
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
    if question.question_type == Question.Type.SLIDER:
        config = question.config or {}
        return {"correct_value": config.get("correct"), "tolerance": config.get("tolerance")}
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


def _as_int(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return None
