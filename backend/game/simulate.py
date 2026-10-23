"""Admin simulacija tekem: boti (+ začasni host), enako kot prava igra — rezultati na lestvico."""

from __future__ import annotations

import random

from accounts.models import create_guest
from game.bonus_models import AiBot
from game.engine import GameError, _answer_for, room_name_for, start_game, submit_answer, validate_settings
from game.modes import MODE_DIRKA, MODE_MULTIPLAYER, MP_MIN_PLAYERS
from game.models import GameResult, GameSession
from game.multiplayer import _bot_answer_message, next_multiplayer
from game.seed_content import ensure_bots
from rooms.models import Room, RoomMember


def simulate_match(staff_user, raw: dict) -> dict:
    """Zaženi tekmo z boti in vrni povzetek + log + rezultate (za lestvico)."""
    ensure_bots()
    raw = raw if isinstance(raw, dict) else {}
    log: list[str] = []

    mode = str(raw.get("mode") or MODE_MULTIPLAYER).strip()
    if mode not in {MODE_MULTIPLAYER, MODE_DIRKA}:
        raise GameError("Način mora biti multiplayer ali dirka.")

    from game.site_settings import get_int_set

    bot_count = max(2, min(int(raw.get("bot_count") or 3), 8))
    categories = list(raw.get("categories") or [])
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
    bots_on_board = bool(raw.get("count_for_leaderboard", True))
    include_host = bool(raw.get("include_host_on_leaderboard", False))
    max_rounds = max(5, min(int(raw.get("max_rounds") or 100), 200))

    raw_keys = raw.get("bot_keys")
    if isinstance(raw_keys, list) and raw_keys:
        wanted_keys = [str(k).strip() for k in raw_keys if str(k).strip()]
    else:
        wanted_keys = []

    profiles = _resolve_bot_profiles(mode, wanted_keys, bot_count)
    log.append(f"Način: {mode}")
    log.append(f"Kategorije: {', '.join(categories) if categories else 'vse'}")
    log.append(f"Boti ({len(profiles)}): {', '.join(p.name for p in profiles)}")

    host = create_guest(f"Sim {random.randint(1000, 9999)}")
    log.append(f"Začasni host: {host.nickname}")

    room = _create_sim_room(
        host,
        mode=mode,
        profiles=profiles,
        categories=categories,
        question_count=question_count,
        time_limit=time_limit,
        sudden_death=sudden_death,
        target_score=target_score,
        safe_every=safe_every,
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
    payloads = start_game(str(host_member.id))
    if not payloads or payloads[0].get("phase") not in {"question", "round_review", "finished"}:
        raise GameError("Igre ni bilo mogoče začeti. Premalo vprašanj v izbranih kategorijah?")

    session = GameSession.objects.filter(room=room).first()
    if session is None:
        raise GameError("Seja ni nastala.")
    log.append(f"Seja #{session.id} aktivna")

    summary = _run_bot_match(
        session,
        host_member_id=str(host_member.id),
        mode=mode,
        max_rounds=max_rounds,
        log=log,
    )
    session.refresh_from_db()

    if not include_host:
        GameResult.objects.filter(game_session=session, user=host).update(counts_for_leaderboard=False)

    results = list(GameResult.objects.filter(game_session=session).order_by("-score", "nickname"))
    reason = (session.state or {}).get("reason") or summary.get("reason") or ""
    log.append(f"Konec: status={session.status}, rund={summary.get('rounds', 0)}, razlog={reason or '—'}")

    return {
        "room_code": room.code,
        "session_id": session.id,
        "mode": mode,
        "status": session.status,
        "rounds_played": summary.get("rounds", 0),
        "reason": reason,
        "log": log,
        "results": [
            {
                "id": row.id,
                "nickname": row.nickname,
                "score": row.score,
                "correct_count": row.correct_count,
                "total_questions": row.total_questions,
                "counts_for_leaderboard": row.counts_for_leaderboard,
            }
            for row in results
        ],
    }


def _resolve_bot_profiles(mode: str, wanted_keys: list[str], bot_count: int) -> list[AiBot]:
    qs = AiBot.objects.filter(is_active=True).order_by("order", "name")
    pool = [b for b in qs if mode in (b.modes or [])]
    if not pool:
        pool = list(qs)
    if wanted_keys:
        by_key = {b.key: b for b in pool}
        selected = [by_key[k] for k in wanted_keys if k in by_key]
        if len(selected) < 2:
            # Dopolni iz poola
            for bot in pool:
                if bot not in selected:
                    selected.append(bot)
                if len(selected) >= 2:
                    break
        pool = selected or pool
    if len(pool) < 2:
        raise GameError("Premalo aktivnih botov za ta način.")

    out: list[AiBot] = []
    for index in range(bot_count):
        out.append(pool[index % len(pool)])
    return out


def _create_sim_room(
    host,
    *,
    mode: str,
    profiles: list[AiBot],
    categories: list,
    question_count: int,
    time_limit: int,
    sudden_death: bool,
    target_score: int,
    safe_every: int,
) -> Room:
    """Ustvari unlisted sobo z izbranimi boti (brez omejitve mp_max_bots)."""
    # validate_settings omejuje bot_count — za sim ga nastavimo po validaciji.
    payload = {
        "mode": mode,
        "question_count": question_count,
        "time_limit_seconds": time_limit,
        "categories": categories,
        "sudden_death": sudden_death,
        "target_score": target_score,
        "safe_every": safe_every,
        "bot_count": 0,
    }
    settings = validate_settings(payload)
    settings["bot_count"] = len(profiles)
    settings["invites"] = []

    from rooms.services import _new_code

    max_players = max(MP_MIN_PLAYERS, len(profiles) + 1)
    for _ in range(20):
        code = _new_code()
        try:
            room = Room.objects.create(
                code=code,
                host=host,
                visibility="unlisted",
                status="waiting",
                settings=settings,
                max_players=max_players,
                name=f"Sim · {room_name_for(mode)}",
            )
            RoomMember.objects.create(
                room=room,
                user=host,
                nickname_in_room=host.nickname[:30],
                color=host.preferred_color or "#7dcea0",
                is_host=True,
                is_ready=True,
                is_connected=True,
            )
            used_nicks = {host.nickname}
            for index, profile in enumerate(profiles):
                nick = profile.name
                if nick in used_nicks:
                    nick = f"{profile.name} {index + 1}"
                used_nicks.add(nick)
                RoomMember.objects.create(
                    room=room,
                    user=None,
                    nickname_in_room=nick[:30],
                    color=profile.color or "#7dcea0",
                    is_host=False,
                    is_ready=True,
                    is_connected=True,
                    is_bot=True,
                    bot_profile=profile,
                )
            return room
        except Exception:
            continue
    raise GameError("Sobe za simulacijo ni bilo mogoče ustvariti.")


def _member_accuracy(member) -> float:
    profile = getattr(member, "bot_profile", None)
    if profile is not None and profile.accuracy is not None:
        return float(profile.accuracy)
    return 0.7


def _run_bot_match(
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
            msg = _bot_answer_message(game_question, accuracy=_member_accuracy(member))
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
            # Poišči odgovor v round_review / progress
            mark = "?"
            if payloads:
                phase = payloads[0].get("phase")
                answers = payloads[0].get("answers") or []
                mine = next((a for a in answers if a.get("member_id") == str(member.id)), None)
                if mine is not None:
                    if mine.get("timed_out"):
                        mark = "čas"
                    elif mine.get("is_correct"):
                        mark = f"prav (+{mine.get('points', 0)})"
                    else:
                        mark = f"narobe ({mine.get('points', 0)})"
                elif phase in {"answer_progress", "waiting_answers", "question"}:
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
