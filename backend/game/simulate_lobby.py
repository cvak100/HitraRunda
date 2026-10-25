"""Admin simulacija lobby načinov: Hitra tekma + Dirka."""

from __future__ import annotations

import random

from accounts.models import create_guest
from game.bonus_models import AiBot
from game.engine import GameError, _answer_for, submit_answer
from game.modes import MODE_DIRKA
from game.models import GameResult, GameSession
from game.multiplayer import _bot_answer_message, next_multiplayer
from game.simulate_common import (
    create_sim_room,
    member_accuracy,
    resolve_bot_profiles,
    sim_response,
)
from game.site_settings import get_int_set


def simulate_lobby(
    *,
    mode: str,
    raw: dict,
    categories: list,
    wanted_keys: list[str],
    bots_on_board: bool,
    include_host: bool,
    max_rounds: int,
    log: list[str],
) -> dict:
    bot_count = max(2, min(int(raw.get("bot_count") or 3), 8))
    allowed_counts = sorted(get_int_set("mp_question_counts") or {5, 10, 20})
    raw_count = int(raw.get("question_count") or 10)
    question_count = min(allowed_counts, key=lambda item: abs(item - raw_count))
    time_limits = sorted(get_int_set("mp_allowed_times") or {30, 60, 90, 120})
    raw_time = int(raw.get("time_limit_seconds") or 30)
    time_limit = min(time_limits, key=lambda item: abs(item - raw_time)) if time_limits else raw_time
    allowed_targets = sorted(get_int_set("dirka_target_scores") or {100, 200, 500})
    raw_target = int(raw.get("target_score") or 200)
    target_score = min(allowed_targets, key=lambda item: abs(item - raw_target))
    allowed_safe = sorted(get_int_set("dirka_safe_every") or {5, 10})
    raw_safe = int(raw.get("safe_every") or 5)
    safe_every = min(allowed_safe, key=lambda item: abs(item - raw_safe))
    sudden_death = bool(raw.get("sudden_death"))

    profiles = resolve_bot_profiles(mode, wanted_keys, bot_count, min_needed=2)
    log.append(f"Način: {mode}")
    log.append(f"Kategorije: {', '.join(categories) if categories else 'vse'}")
    log.append(f"Boti ({len(profiles)}): {', '.join(p.name for p in profiles)}")

    host = create_guest(f"Sim {random.randint(1000, 9999)}")
    log.append(f"Začasni host: {host.nickname}")

    room = create_sim_room(
        host,
        mode=mode,
        profiles=profiles,
        categories=categories,
        question_count=question_count,
        time_limit=time_limit,
        sudden_death=sudden_death,
        target_score=target_score,
        safe_every=safe_every,
        friend_keys=[],
    )
    log.append(f"Soba {room.code} ustvarjena")

    host_member = room.members.filter(user=host, left_at__isnull=True).first()
    if host_member is None:
        raise GameError("Simulacija: manjka host.")
    host_member.is_ready = True
    host_member.save(update_fields=["is_ready"])

    bots = list(room.members.filter(is_bot=True, left_at__isnull=True))
    if len(bots) < 2:
        raise GameError("Premalo botov — izberi vsaj 2 bota za ta način.")

    if bots_on_board:
        AiBot.objects.filter(id__in=[b.bot_profile_id for b in bots if b.bot_profile_id]).update(
            count_for_leaderboard=True
        )
        log.append("Boti štejejo za javno lestvico")

    log.append("Zaganjam igro…")
    # Simulacija preskoči lobby countdown — takoj start_*.
    if mode == MODE_DIRKA:
        from game.dirka import start_dirka

        payloads = start_dirka(str(host_member.id))
    else:
        from game.multiplayer import start_multiplayer

        payloads = start_multiplayer(str(host_member.id))
    if not payloads or payloads[0].get("phase") not in {"question", "round_review", "finished"}:
        raise GameError("Igre ni bilo mogoče začeti. Premalo vprašanj v izbranih kategorijah?")

    session = (
        GameSession.objects.filter(room=room, status__in=["preparing", "active"])
        .order_by("-created_at")
        .first()
    )
    if session is None:
        raise GameError("Seja ni nastala.")
    log.append(f"Seja #{session.id} aktivna")

    summary = run_lobby_match(
        session,
        host_member_id=str(host_member.id),
        mode=mode,
        max_rounds=max_rounds,
        log=log,
    )
    session.refresh_from_db()

    if not include_host:
        GameResult.objects.filter(game_session=session, user=host).update(counts_for_leaderboard=False)

    return sim_response(session, mode, summary, log)


def run_lobby_match(
    session: GameSession,
    host_member_id: str,
    mode: str,
    max_rounds: int,
    log: list[str],
) -> dict:
    from game.dirka import next_dirka

    rounds = 0
    for _ in range(max_rounds):
        session.refresh_from_db()
        if session.status != "active":
            return {"rounds": rounds, "reason": (session.state or {}).get("reason") or "finished"}

        game_question = session.game_questions.filter(order=session.current_question_index).first()
        if game_question is None:
            return {"rounds": rounds, "reason": "no_question"}

        q_preview = (game_question.question.text or "")[:60]
        log.append(f"Runda {rounds + 1}: {q_preview}{'…' if len(game_question.question.text or '') > 60 else ''}")

        members = list(
            session.room.members.filter(left_at__isnull=True).select_related("bot_profile", "user")
        )
        if not members:
            return {"rounds": rounds, "reason": "empty"}

        for member in members:
            if _answer_for(game_question, member) is not None:
                continue
            msg = _bot_answer_message(game_question, accuracy=member_accuracy(member))
            try:
                payloads = submit_answer(str(member.id), msg)
            except GameError:
                try:
                    payloads = submit_answer(
                        str(member.id),
                        {
                            "type": "submit_answer",
                            "game_question_id": str(game_question.id),
                            "timeout": True,
                        },
                    )
                except GameError:
                    log.append(f"  · {member.nickname_in_room}: napaka pri oddaji")
                    continue
            mark = "?"
            if payloads:
                answers = payloads[0].get("answers") or []
                mine = next((a for a in answers if a.get("member_id") == str(member.id)), None)
                if mine is not None:
                    if mine.get("timed_out"):
                        mark = "čas"
                    elif mine.get("is_correct"):
                        mark = f"prav (+{mine.get('points', 0)})"
                    else:
                        mark = f"narobe ({mine.get('points', 0)})"
                elif payloads[0].get("phase") in {"answer_progress", "waiting_answers", "question"}:
                    mark = "oddano"
            log.append(f"  · {member.nickname_in_room}: {mark}")

        session.refresh_from_db()
        if session.status != "active":
            log.append("Tekma končana med rundom (zmaga / konec).")
            return {"rounds": rounds + 1, "reason": (session.state or {}).get("reason") or "finished"}

        try:
            if mode == MODE_DIRKA:
                payloads = next_dirka(host_member_id)
            else:
                payloads = next_multiplayer(host_member_id)
        except GameError as exc:
            log.append(f"Naprej ni uspel: {exc.message}")
            return {"rounds": rounds + 1, "reason": exc.message}

        rounds += 1
        phase = (payloads[0].get("phase") if payloads else "") or ""
        if phase == "finished":
            log.append("Končna lestvica pripravljena.")
            return {"rounds": rounds, "reason": "finished"}
        if phase == "round_review":
            try:
                if mode == MODE_DIRKA:
                    next_dirka(host_member_id)
                else:
                    next_multiplayer(host_member_id)
                log.append("  → naslednje vprašanje")
            except GameError as exc:
                log.append(f"  → next po review: {exc.message}")
        elif phase == "question":
            log.append("  → naslednje vprašanje")

    log.append("Dosežena meja rund.")
    return {"rounds": rounds, "reason": "max_rounds"}
