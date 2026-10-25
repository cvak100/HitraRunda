"""Solo način Ugib zastav: država↔zastava, nabor = regija/kontinent, brez ponavljanja."""

from __future__ import annotations

import random
import secrets
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from game.engine import GameError, _lock
from game.modes import MODE_ZASTAVE
from game.models import GameResult, GameSession
from game.site_settings import get as site_get
from geo.importer import ensure_seed_countries, quiz_countries
from geo.models import Country

KIND_FLAG_TO_NAME = "flag_to_name"
KIND_NAME_TO_FLAG = "name_to_flag"
KINDS_ALL = (KIND_FLAG_TO_NAME, KIND_NAME_TO_FLAG)


def snapshot_flags(member_id):
    with transaction.atomic():
        member, _room, session = _lock(member_id, include_finished=True)
        if session is None:
            return {"type": "game_state", "phase": "waiting"}
        if session.status == "active":
            _expire_if_due(member, _room, session)
            session.refresh_from_db()
        if session.status == "finished":
            return finished_payload(session, member)
        state = session.state or {}
        current = state.get("current") or {}
        if current.get("answered"):
            return review_payload(session, current, from_history=True)
        return question_payload(session, "game_state")


def start_flags(member_id):
    with transaction.atomic():
        member, room, session = _lock(member_id)
        if not member.is_host:
            raise GameError("Samo gostitelj lahko začne igro.")
        if session is not None:
            return [snapshot_flags(member_id)]
        if room.status != "waiting":
            raise GameError("Igre ni mogoče začeti.")
        ensure_seed_countries()
        settings = room.settings or {}
        regions = [
            str(r).strip().lower()
            for r in (settings.get("regions") or [])
            if str(r).strip()
        ]
        continents = [
            str(c).strip().lower()
            for c in (settings.get("continents") or [])
            if str(c).strip()
        ]
        if not continents and not regions and settings.get("continent"):
            legacy = str(settings.get("continent") or "").strip().lower()
            if legacy and "," not in legacy:
                continents = [legacy]
        kinds = list(settings.get("flag_kinds") or list(KINDS_ALL))
        kinds = [k for k in kinds if k in KINDS_ALL] or list(KINDS_ALL)
        pool_qs = list(
            quiz_countries(
                continents=continents or None,
                subregions=regions or None,
            ).order_by("iso2")
        )
        if len(pool_qs) < 4:
            raise GameError("Za izbor ni dovolj držav (vsaj 4).")
        iso_pool = [c.iso2 for c in pool_qs]
        rng = random.Random(secrets.randbits(64))
        rng.shuffle(iso_pool)
        now = timezone.now()
        limit = int(settings.get("time_limit_seconds") or site_get("zastave_time_seconds"))
        scope_label = (
            ",".join(regions) if regions else (",".join(continents) if continents else "all")
        )
        session = GameSession.objects.create(
            room=room,
            mode=MODE_ZASTAVE,
            status="active",
            total_questions=len(iso_pool),
            current_question_index=0,
            time_limit_seconds=limit,
            state={
                "continent": scope_label,
                "continents": continents,
                "regions": regions,
                "flag_kinds": kinds,
                "pool": iso_pool,
                "index": 0,
                "score": 0,
                "correct_count": 0,
                "answered_count": 0,
                "reason": "",
                "history": [],
                "rng_seed": rng.random(),
                "current": None,
            },
            started_at=now,
        )
        _deal_current(session, rng)
        room.status = "playing"
        room.started_at = now
        room.last_activity = now
        room.save(update_fields=["status", "started_at", "last_activity"])
        return [question_payload(session, "game_started")]


def submit_flags(member_id, message, *, _from_expire=False):
    if not isinstance(message, dict):
        raise GameError("Neveljavno sporočilo.")
    with transaction.atomic():
        member, room, session = _lock(member_id)
        if session is None or session.status != "active":
            if session is not None and session.status == "finished":
                return [finished_payload(session, member)]
            raise GameError("Igra ni aktivna.")
        if not _from_expire:
            _expire_if_due(member, room, session)
            session.refresh_from_db()
            if session.status == "finished":
                return [finished_payload(session, member)]
        return _grade_flags(member, room, session, message)


def next_flags(member_id):
    with transaction.atomic():
        member, room, session = _lock(member_id)
        if session is None or session.status != "active":
            if session is not None and session.status == "finished":
                return [finished_payload(session, member)]
            raise GameError("Igra ni aktivna.")
        state = dict(session.state or {})
        current = state.get("current") or {}
        if not current.get("answered"):
            raise GameError("Najprej odgovori.")
        idx = int(state.get("index") or 0) + 1
        pool = list(state.get("pool") or [])
        if idx >= len(pool):
            _finalize(session, room, member, "completed", timezone.now())
            return [finished_payload(session, member)]
        state["index"] = idx
        session.state = state
        session.current_question_index = idx
        session.save(update_fields=["state", "current_question_index"])
        rng = random.Random(hash((state.get("rng_seed"), idx)) & 0xFFFFFFFFFFFFFFFF)
        _deal_current(session, rng)
        return [question_payload(session, "game_state")]


def apply_flags_timeout(member_id, question_id):
    return submit_flags(
        member_id,
        {"timeout": True, "game_question_id": str(question_id), "option_id": ""},
        _from_expire=True,
    )


def seconds_until_flags_deadline(question_id):
    parts = str(question_id).split("-", 2)
    if len(parts) < 2:
        return None
    try:
        session_id = int(parts[0])
    except (TypeError, ValueError):
        return None
    session = GameSession.objects.filter(pk=session_id, mode=MODE_ZASTAVE, status="active").first()
    if session is None:
        return None
    current = (session.state or {}).get("current") or {}
    if str(current.get("id") or "") != str(question_id):
        return None
    if current.get("answered") or not current.get("deadline_at"):
        return None
    from django.utils.dateparse import parse_datetime

    deadline = parse_datetime(current["deadline_at"])
    if deadline is None:
        return None
    if timezone.is_naive(deadline):
        deadline = timezone.make_aware(deadline, timezone.get_current_timezone())
    return max(0.0, (deadline - timezone.now()).total_seconds())


def _grade_flags(member, room, session, message):
    state = dict(session.state or {})
    current = state.get("current") or {}
    qid = str(current.get("id") or "")
    if str(message.get("game_question_id") or message.get("question_id") or "") != qid:
        raise GameError("To vprašanje ni aktivno.")
    if current.get("answered"):
        raise GameError("Že si odgovoril.")
    timed_out = bool(message.get("timeout"))
    selected = str(message.get("option_id") or message.get("selected") or "").strip().lower()
    correct_id = str(current.get("correct_id") or "").lower()
    if timed_out:
        is_correct = False
        selected = selected or ""
    else:
        if not selected:
            raise GameError("Izberi odgovor.")
        is_correct = selected == correct_id
    now = timezone.now()
    started = current.get("started_at")
    time_taken_ms = None
    if started:
        from django.utils.dateparse import parse_datetime

        st = parse_datetime(started)
        if st is not None:
            if timezone.is_naive(st):
                st = timezone.make_aware(st, timezone.get_current_timezone())
            time_taken_ms = max(0, int((now - st).total_seconds() * 1000))
    points = int(site_get("zastave_correct_points")) if is_correct else 0
    if is_correct and time_taken_ms is not None and session.time_limit_seconds:
        ratio = 1 - min(1.0, time_taken_ms / (session.time_limit_seconds * 1000))
        points += int(points * 0.5 * ratio)
    history_row = {
        "id": qid,
        "iso2": current.get("iso2"),
        "kind": current.get("kind"),
        "prompt": current.get("prompt"),
        "flag": current.get("flag"),
        "correct_id": correct_id,
        "correct_label": current.get("correct_label"),
        "selected_id": selected,
        "selected_label": _label_for(current, selected),
        "is_correct": is_correct,
        "timed_out": timed_out,
        "points": points,
        "time_taken_ms": time_taken_ms,
        "options": current.get("options") or [],
    }
    history = list(state.get("history") or [])
    history.append(history_row)
    state["history"] = history
    state["answered_count"] = int(state.get("answered_count") or 0) + 1
    if is_correct:
        state["correct_count"] = int(state.get("correct_count") or 0) + 1
        state["score"] = int(state.get("score") or 0) + points
    current["answered"] = True
    current["is_correct"] = is_correct
    state["current"] = current
    session.state = state
    session.current_question_index = int(state.get("index") or 0)
    session.save(update_fields=["state", "current_question_index"])

    review = review_payload(
        session,
        current,
        is_correct=is_correct,
        timed_out=timed_out,
        points=points,
        selected_id=selected,
        score=state["score"],
        correct_count=state["correct_count"],
        answered_count=state["answered_count"],
    )
    idx = int(state.get("index") or 0)
    pool = list(state.get("pool") or [])
    if idx + 1 >= len(pool):
        _finalize(session, room, member, "completed", now)
        return [review, finished_payload(session, member)]
    return [review]


def review_payload(
    session,
    current,
    *,
    is_correct=None,
    timed_out=False,
    points=0,
    selected_id="",
    score=None,
    correct_count=None,
    answered_count=None,
    from_history=False,
):
    state = session.state or {}
    if from_history:
        history = list(state.get("history") or [])
        last = history[-1] if history else {}
        is_correct = bool(last.get("is_correct"))
        timed_out = bool(last.get("timed_out"))
        points = int(last.get("points") or 0)
        selected_id = str(last.get("selected_id") or "")
    correct_id = str(current.get("correct_id") or "").lower()
    return {
        "type": "answer_result",
        "phase": "review",
        "mode": MODE_ZASTAVE,
        "is_correct": bool(is_correct),
        "timed_out": timed_out,
        "points": points,
        "score": score if score is not None else state.get("score", 0),
        "correct_count": correct_count if correct_count is not None else state.get("correct_count", 0),
        "answered_count": answered_count
        if answered_count is not None
        else state.get("answered_count", 0),
        "total_questions": session.total_questions,
        "correct_id": correct_id,
        "correct_label": current.get("correct_label"),
        "selected_id": selected_id,
        "correct_option_ids": [correct_id],
        "selected_option_ids": [selected_id] if selected_id else [],
        "question": _public_question(current, reveal=True),
        "index": state.get("index"),
        "prize_reached": score if score is not None else state.get("score", 0),
        "speed_bonus_total": 0,
    }


def question_payload(session, message_type="game_state"):
    state = session.state or {}
    current = state.get("current") or {}
    payload = {
        "type": message_type,
        "phase": "question",
        "mode": MODE_ZASTAVE,
        "score": state.get("score", 0),
        "correct_count": state.get("correct_count", 0),
        "answered_count": state.get("answered_count", 0),
        "total_questions": session.total_questions,
        "index": state.get("index", 0),
        "continent": state.get("continent"),
        "time_limit_seconds": session.time_limit_seconds,
        "question": _public_question(current, reveal=False),
        "server_now": timezone.now().isoformat(),
        "deadline_at": current.get("deadline_at"),
    }
    return payload


def finished_payload(session, member):
    state = session.state or {}
    from game.engine import _attach_result_id

    payload = {
        "type": "game_finished",
        "phase": "finished",
        "finished": True,
        "mode": MODE_ZASTAVE,
        "reason": state.get("reason") or "completed",
        "score": state.get("score", 0),
        "correct_count": state.get("correct_count", 0),
        "answered_count": state.get("answered_count", 0),
        "total": session.total_questions,
        "total_questions": session.total_questions,
        "nickname": member.nickname_in_room,
        "continent": state.get("continent"),
        "history": state.get("history") or [],
        "prize_reached": state.get("score", 0),
        "speed_bonus_total": 0,
        "prize_ladder": [],
        "is_correct": bool((state.get("history") or [{}])[-1].get("is_correct"))
        if state.get("history")
        else False,
    }
    return _attach_result_id(payload, session, member)


def _deal_current(session, rng: random.Random):
    state = dict(session.state or {})
    pool = list(state.get("pool") or [])
    idx = int(state.get("index") or 0)
    iso2 = pool[idx]
    target = Country.objects.filter(pk=iso2).first()
    if target is None:
        raise GameError("Država v naboru ne obstaja.")
    kinds = list(state.get("flag_kinds") or KINDS_ALL)
    kind = rng.choice(kinds)
    distractors = _pick_distractors(target, pool, rng, k=3)
    options_countries = [target, *distractors]
    rng.shuffle(options_countries)
    now = timezone.now()
    deadline = now + timedelta(seconds=session.time_limit_seconds)
    qid = f"{session.id}-{idx}-{iso2}"
    if kind == KIND_NAME_TO_FLAG:
        prompt = f"Katera zastava pripada državi {target.name_sl}?"
        options = [
            {"id": c.iso2, "flag": c.flag, "label": c.name_sl, "kind": "flag"}
            for c in options_countries
        ]
    else:
        prompt = "Katera država je to?"
        kind = KIND_FLAG_TO_NAME
        options = [
            {"id": c.iso2, "flag": c.flag, "label": c.name_sl, "kind": "name"}
            for c in options_countries
        ]
    current = {
        "id": qid,
        "iso2": target.iso2,
        "kind": kind,
        "prompt": prompt,
        "flag": target.flag,
        "name_sl": target.name_sl,
        "correct_id": target.iso2,
        "correct_label": target.name_sl,
        "options": options,
        "started_at": now.isoformat(),
        "deadline_at": deadline.isoformat(),
        "answered": False,
    }
    state["current"] = current
    session.state = state
    session.save(update_fields=["state"])


def _pick_distractors(target: Country, pool: list[str], rng: random.Random, k: int = 3) -> list[Country]:
    others = [iso for iso in pool if iso != target.iso2]
    # Najprej sosedje / ista subregija.
    prefer: list[str] = []
    borders = set(target.border_iso2())
    for iso in others:
        if iso in borders:
            prefer.append(iso)
    same_sub = list(
        Country.objects.filter(
            iso2__in=others,
            continent=target.continent,
            subregion=target.subregion,
            active=True,
            quiz_exclude=False,
        ).exclude(subregion="")
        .values_list("iso2", flat=True)
    )
    for iso in same_sub:
        if iso not in prefer:
            prefer.append(iso)
    same_cont = [iso for iso in others if iso not in prefer]
    ordered = prefer + same_cont
    rng.shuffle(ordered)
    # Prefer list keep order bias: reshuffle within prefer first
    pick_ids = []
    for iso in ordered:
        if iso not in pick_ids:
            pick_ids.append(iso)
        if len(pick_ids) >= k:
            break
    if len(pick_ids) < k:
        extra = list(
            quiz_countries(continent=target.continent)
            .exclude(iso2__in=[target.iso2, *pick_ids])
            .values_list("iso2", flat=True)
        )
        rng.shuffle(extra)
        pick_ids.extend(extra[: k - len(pick_ids)])
    countries = list(Country.objects.filter(iso2__in=pick_ids))
    by_id = {c.iso2: c for c in countries}
    return [by_id[i] for i in pick_ids if i in by_id][:k]


def _public_question(current: dict, *, reveal: bool) -> dict:
    options = list(current.get("options") or [])
    if not reveal:
        # Ne pošlji correct v optionih.
        options = [
            {
                "id": o.get("id"),
                "flag": o.get("flag"),
                "label": o.get("label") if o.get("kind") == "name" else None,
                "kind": o.get("kind"),
            }
            for o in options
        ]
    q = {
        "game_question_id": current.get("id"),
        "text": current.get("prompt"),
        "question_type": "multiple_choice",
        "flag_kind": current.get("kind"),
        "flag": current.get("flag") if current.get("kind") == KIND_FLAG_TO_NAME else None,
        "country_name": current.get("name_sl") if current.get("kind") == KIND_NAME_TO_FLAG else None,
        "difficulty": 1,
        "category": "zastave",
        "category_name": "Zastave",
        "image": None,
        "options": options,
        "started_at": current.get("started_at"),
        "deadline_at": current.get("deadline_at"),
    }
    if reveal:
        q["correct_id"] = current.get("correct_id")
        q["correct_label"] = current.get("correct_label")
        q["iso2"] = current.get("iso2")
        q["flag"] = current.get("flag")
    return q


def _label_for(current: dict, option_id: str) -> str:
    for opt in current.get("options") or []:
        if str(opt.get("id") or "").lower() == option_id:
            return str(opt.get("label") or opt.get("flag") or option_id)
    return option_id


def _expire_if_due(member, room, session):
    if session.status != "active":
        return
    state = session.state or {}
    current = state.get("current") or {}
    if current.get("answered") or not current.get("deadline_at"):
        return
    from django.utils.dateparse import parse_datetime

    deadline = parse_datetime(current["deadline_at"])
    if deadline is None:
        return
    if timezone.is_naive(deadline):
        deadline = timezone.make_aware(deadline, timezone.get_current_timezone())
    if timezone.now() <= deadline:
        return
    _grade_flags(
        member,
        room,
        session,
        {"timeout": True, "game_question_id": current.get("id"), "option_id": ""},
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
            "prize_reached": 0,
            "speed_bonus": 0,
            "correct_count": state.get("correct_count", 0),
            "total_questions": session.total_questions,
            "duration_ms": duration,
            "is_guest": member.user.is_guest,
            "reason": reason,
            "room_code": room.code,
        },
    )
