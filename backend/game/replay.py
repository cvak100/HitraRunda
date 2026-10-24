from game.models import GameResult
from questions.models import Question

SINGLE = {Question.Type.MULTIPLE_CHOICE, Question.Type.TRUE_FALSE}


def session_detail(session, result=None, for_user=None):
    result = result or _result(session, for_user=for_user)
    state = session.state or {}
    user_id = None
    if result is not None and result.user_id:
        user_id = result.user_id
    elif for_user is not None:
        user_id = getattr(for_user, "id", None)
    stages = []
    questions = session.game_questions.select_related("question__category").prefetch_related(
        "question__options", "answers__room_member"
    )
    for game_question in questions:
        answers = list(game_question.answers.all())
        if game_question.started_at is None and not answers:
            continue
        stages.append(_stage(game_question, user_id=user_id))
    played_at = result.played_at if result else session.finished_at or session.started_at or session.created_at
    return {
        "session_id": session.id,
        "result_id": result.id if result else None,
        "code": session.room.code,
        "nickname": _nickname(session, result),
        "status": session.status,
        "mode": session.mode,
        "score": result.score if result else state.get("score", 0),
        "prize_reached": result.prize_reached if result else state.get("prize_reached", 0),
        "speed_bonus": result.speed_bonus if result else state.get("speed_bonus_total", 0),
        "correct_count": result.correct_count if result else state.get("correct_count", 0),
        "total_questions": session.total_questions,
        "reason": (result.reason if result else state.get("reason")) or "",
        "played_at": played_at.isoformat() if played_at else None,
        "duration_ms": result.duration_ms if result else None,
        "stages": stages,
    }


def result_id_for(session, member=None):
    """ID GameResult za člana (ali najboljši rezultat, če član ni znan)."""
    qs = GameResult.objects.filter(game_session=session)
    if member is not None and getattr(member, "user_id", None):
        row = qs.filter(user_id=member.user_id).order_by("-id").first()
        if row:
            return row.id
        # Gost/bot: ujemanje po vzdevku v sobi.
        nick = getattr(member, "nickname_in_room", None) or ""
        if nick:
            row = qs.filter(nickname=nick).order_by("-id").first()
            if row:
                return row.id
    row = qs.order_by("-score", "duration_ms", "played_at").first()
    return row.id if row else None


def _result(session, for_user=None):
    qs = session.results.all()
    if for_user is not None and getattr(for_user, "id", None):
        row = qs.filter(user_id=for_user.id).order_by("-id").first()
        if row:
            return row
    return qs.order_by("-score", "duration_ms", "played_at").first()


def _nickname(session, result):
    if result and result.nickname:
        return result.nickname
    host = session.room.members.filter(is_host=True).first()
    return host.nickname_in_room if host else ""


def _stage(game_question, user_id=None):
    question = game_question.question
    answers = list(game_question.answers.all())
    answer = None
    if user_id is not None:
        answer = next(
            (
                row
                for row in answers
                if row.room_member_id and getattr(row.room_member, "user_id", None) == user_id
            ),
            None,
        )
    if answer is None and answers:
        answer = answers[0]
    data = (answer.answer_data if answer else None) or {}
    timed_out = bool(data.get("timeout"))
    return {
        "order": game_question.order + 1,
        "text": question.text,
        "question_type": question.question_type,
        "category_name": question.category.name,
        "difficulty": question.difficulty,
        "explanation": question.explanation,
        "is_correct": None if answer is None else bool(answer.is_correct),
        "timed_out": timed_out,
        "time_taken_ms": None if answer is None else answer.time_taken_ms,
        "speed_bonus": 0 if answer is None else answer.points,
        "given": _given(game_question, answer, timed_out),
        "correct": _correct(game_question),
    }


def _correct(game_question):
    question = game_question.question
    if question.question_type in {Question.Type.MULTIPLE_CHOICE, Question.Type.TRUE_FALSE, Question.Type.MULTI_SELECT}:
        return ", ".join(option.text for option in question.options.all() if option.is_correct)
    if question.question_type == Question.Type.ORDERING:
        ordered = sorted(question.options.all(), key=lambda option: (option.order, option.id))
        return " → ".join(option.text for option in ordered)
    if question.question_type == Question.Type.MATCHING:
        pairs = (question.config or {}).get("pairs") or []
        return "; ".join(f"{pair.get('left')} → {pair.get('right')}" for pair in pairs)
    if question.question_type == Question.Type.SLIDER:
        config = question.config or {}
        tolerance = config.get("tolerance") or 0
        correct = config.get("correct")
        if tolerance:
            return f"{correct} (± {tolerance})"
        return str(correct)
    return ""


def _given(game_question, answer, timed_out):
    if answer is None:
        return "Brez odgovora"
    if timed_out:
        return "Čas je potekel"
    question = game_question.question
    data = answer.answer_data or {}
    names = {option.id: option.text for option in question.options.all()}
    if question.question_type in SINGLE:
        option_id = _as_int(data.get("option_id")) or answer.selected_option_id
        return names.get(option_id, "—")
    if isinstance(data.get("option_ids"), list):
        texts = [names.get(_as_int(item), "?") for item in data["option_ids"]]
        separator = " → " if question.question_type == Question.Type.ORDERING else ", "
        return separator.join(texts)
    if question.question_type == Question.Type.MATCHING:
        return _matching_given(game_question, data.get("pairs") or [])
    if data.get("value") is not None:
        return str(data["value"])
    return "—"


def _matching_given(game_question, pairs):
    presentation = game_question.presentation or {}
    left = {item["id"]: item["text"] for item in presentation.get("left") or []}
    right = {item["id"]: item["text"] for item in presentation.get("right") or []}
    parts = []
    for pair in pairs:
        if not isinstance(pair, dict):
            continue
        parts.append(f"{left.get(pair.get('left_id'), '?')} → {right.get(pair.get('right_id'), '?')}")
    return "; ".join(parts) or "—"


def _as_int(value):
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return None
