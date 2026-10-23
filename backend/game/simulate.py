"""Admin simulacija tekem: boti (+ začasni host), enako kot prava igra — rezultati na lestvico."""

from __future__ import annotations

import random
from datetime import timedelta

from django.utils import timezone

from accounts.models import create_guest
from accounts.nicknames import resolve_avatar_key
from game.bonus_models import AiBot, PhoneFriend
from game.engine import (
    GameError,
    _answer_for,
    next_question,
    room_name_for,
    start_game,
    submit_answer,
    validate_settings,
)
from game.modes import (
    LOBBY_MODES,
    MODE_60_SEKUND,
    MODE_ALA_MILIJONAR,
    MODE_DIRKA,
    MODE_HITRARUNDA,
    MODE_MULTIPLAYER,
    MP_MIN_PLAYERS,
    PLAYABLE_MODES,
    SOLO_MODES,
)
from game.models import GameResult, GameSession
from game.multiplayer import _bot_answer_message, next_multiplayer
from game.seed_content import ensure_bots
from game.site_settings import get as site_get
from game.site_settings import get_int_set
from rooms.models import Room, RoomMember
from rooms.services import _new_code


def simulate_match(staff_user, raw: dict) -> dict:
    """Zaženi tekmo z boti in vrni povzetek + log + rezultate (za lestvico)."""
    ensure_bots()
    raw = raw if isinstance(raw, dict) else {}
    log: list[str] = []

    mode = str(raw.get("mode") or MODE_MULTIPLAYER).strip()
    if mode == "millionaire":
        mode = MODE_HITRARUNDA
    if mode not in PLAYABLE_MODES:
        raise GameError("Neznan način igre.")

    categories = list(raw.get("categories") or [])
    bots_on_board = bool(raw.get("count_for_leaderboard", True))
    include_host = bool(raw.get("include_host_on_leaderboard", False))
    max_rounds = max(5, min(int(raw.get("max_rounds") or 100), 200))

    raw_keys = raw.get("bot_keys")
    if isinstance(raw_keys, list) and raw_keys:
        wanted_keys = [str(k).strip() for k in raw_keys if str(k).strip()]
    else:
        wanted_keys = []

    if mode in LOBBY_MODES:
        return _simulate_lobby(
            mode=mode,
            raw=raw,
            categories=categories,
            wanted_keys=wanted_keys,
            bots_on_board=bots_on_board,
            include_host=include_host,
            max_rounds=max_rounds,
            log=log,
        )
    return _simulate_solo(
        mode=mode,
        raw=raw,
        categories=categories,
        wanted_keys=wanted_keys,
        bots_on_board=bots_on_board,
        max_rounds=max_rounds,
        log=log,
    )


def _simulate_lobby(
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

    profiles = _resolve_bot_profiles(mode, wanted_keys, bot_count, min_needed=2)
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
    payloads = start_game(str(host_member.id))
    if not payloads or payloads[0].get("phase") not in {"question", "round_review", "finished"}:
        raise GameError("Igre ni bilo mogoče začeti. Premalo vprašanj v izbranih kategorijah?")

    session = GameSession.objects.filter(room=room).first()
    if session is None:
        raise GameError("Seja ni nastala.")
    log.append(f"Seja #{session.id} aktivna")

    summary = _run_lobby_match(
        session,
        host_member_id=str(host_member.id),
        mode=mode,
        max_rounds=max_rounds,
        log=log,
    )
    session.refresh_from_db()

    if not include_host:
        GameResult.objects.filter(game_session=session, user=host).update(counts_for_leaderboard=False)

    return _sim_response(session, mode, summary, log)


def _simulate_solo(
    *,
    mode: str,
    raw: dict,
    categories: list,
    wanted_keys: list[str],
    bots_on_board: bool,
    max_rounds: int,
    log: list[str],
) -> dict:
    profiles = _resolve_bot_profiles(mode, wanted_keys, bot_count=1, min_needed=1)
    profile = profiles[0]

    if mode == MODE_HITRARUNDA:
        raw_count = int(raw.get("question_count") or 10)
        question_count = max(5, min(15, raw_count))
        time_limits = sorted(get_int_set("hr_allowed_times") or {10, 15, 20, 30})
        raw_time = int(raw.get("time_limit_seconds") or 20)
        time_limit = min(time_limits, key=lambda item: abs(item - raw_time)) if time_limits else raw_time
    elif mode == MODE_ALA_MILIJONAR:
        question_count = len(list(site_get("ala_difficulty_targets") or [])) or 12
        time_limit = int(site_get("ala_time_seconds") or 30)
    else:
        # 60 sekund — count/time nastavi validate_settings.
        question_count = 0
        time_limit = int(site_get("sixty_start_seconds") or 60)

    friend_keys = []
    if mode == MODE_ALA_MILIJONAR:
        pick = int(site_get("ala_friends_pick") or 3)
        friend_keys = list(
            PhoneFriend.objects.filter(is_active=True).order_by("order", "name").values_list("key", flat=True)[:pick]
        )
        if len(friend_keys) < pick:
            raise GameError(f"Za Ala milijonar potrebuješ {pick} aktivnih prijateljev (Klic v sili).")

    log.append(f"Način: {mode}")
    log.append(f"Kategorije: {', '.join(categories) if categories else 'vse'}")
    log.append(f"Bot profil: {profile.name} ({int(round(float(profile.accuracy or 0.7) * 100))} %)")

    host = create_guest(profile.name[:30])
    host.avatar = profile.avatar or resolve_avatar_key(nickname=profile.name, seed=profile.key)
    host.preferred_color = (profile.color or host.preferred_color or "#7dcea0")[:20]
    host.save(update_fields=["avatar", "preferred_color"])
    log.append(f"Igralec: {host.nickname}")

    room = _create_sim_room(
        host,
        mode=mode,
        profiles=[],
        categories=categories,
        question_count=question_count,
        time_limit=time_limit,
        sudden_death=False,
        target_score=200,
        safe_every=5,
        friend_keys=friend_keys,
    )
    log.append(f"Soba {room.code} ustvarjena")

    host_member = room.members.filter(user=host, left_at__isnull=True).first()
    if host_member is None:
        raise GameError("Simulacija: manjka host.")
    host_member.bot_profile = profile
    host_member.is_ready = True
    host_member.save(update_fields=["bot_profile", "is_ready"])

    log.append("Zaganjam igro…")
    payloads = start_game(str(host_member.id))
    phase = (payloads[0].get("phase") if payloads else "") or ""
    if phase not in {"question", "review", "finished"}:
        raise GameError("Igre ni bilo mogoče začeti. Premalo vprašanj v izbranih kategorijah?")

    session = GameSession.objects.filter(room=room).first()
    if session is None:
        raise GameError("Seja ni nastala.")
    log.append(f"Seja #{session.id} aktivna")

    summary = _run_solo_match(
        session,
        host_member_id=str(host_member.id),
        mode=mode,
        accuracy=float(profile.accuracy if profile.accuracy is not None else 0.7),
        max_rounds=40 if mode == MODE_60_SEKUND else max_rounds,
        log=log,
    )
    session.refresh_from_db()
    if mode == MODE_60_SEKUND and session.status == "active":
        _force_sixty_finish(session, str(host_member.id), log)
        session.refresh_from_db()
        summary = {**summary, "reason": (session.state or {}).get("reason") or summary.get("reason")}

    GameResult.objects.filter(game_session=session, user=host).update(
        counts_for_leaderboard=bots_on_board,
        nickname=profile.name[:30],
    )
    if bots_on_board:
        log.append("Rezultat gre na javno lestvico")
    else:
        log.append("Rezultat ne gre na javno lestvico")

    return _sim_response(session, mode, summary, log)


def _sim_response(session: GameSession, mode: str, summary: dict, log: list[str]) -> dict:
    results = list(GameResult.objects.filter(game_session=session).order_by("-score", "nickname"))
    reason = (session.state or {}).get("reason") or summary.get("reason") or ""
    log.append(f"Konec: status={session.status}, rund={summary.get('rounds', 0)}, razlog={reason or '—'}")
    return {
        "room_code": session.room.code,
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


def _resolve_bot_profiles(mode: str, wanted_keys: list[str], bot_count: int, min_needed: int) -> list[AiBot]:
    qs = list(AiBot.objects.filter(is_active=True).order_by("order", "name"))
    if mode in LOBBY_MODES:
        pool = [b for b in qs if mode in (b.modes or [])]
        if not pool:
            pool = qs
    else:
        # Solo: katerikoli aktiven bot kot profil natančnosti.
        pool = qs
    if wanted_keys:
        by_key = {b.key: b for b in pool}
        # Če ključ ni v poolu (solo + bot samo za MP), vzemi iz vseh.
        all_by_key = {b.key: b for b in qs}
        selected = []
        for key in wanted_keys:
            bot = by_key.get(key) or all_by_key.get(key)
            if bot and bot not in selected:
                selected.append(bot)
        if len(selected) < min_needed:
            for bot in pool:
                if bot not in selected:
                    selected.append(bot)
                if len(selected) >= min_needed:
                    break
        pool = selected or pool
    if len(pool) < min_needed:
        raise GameError(f"Premalo aktivnih botov (potrebujem vsaj {min_needed}).")

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
    friend_keys: list[str],
) -> Room:
    """Ustvari unlisted sobo (lobby: z boti; solo: samo host)."""
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
    if friend_keys:
        payload["friend_keys"] = friend_keys
    settings = validate_settings(payload)
    if mode in LOBBY_MODES:
        settings["bot_count"] = len(profiles)
    settings["invites"] = []

    max_players = max(MP_MIN_PLAYERS, len(profiles) + 1) if mode in LOBBY_MODES else 1
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


def _run_lobby_match(
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


def _force_sixty_finish(session: GameSession, host_member_id: str, log: list[str]) -> None:
    """Simulacija: umetno potek časa, da 60s tekma dobi rezultat."""
    from game.sixty import snapshot_sixty

    state = dict(session.state or {})
    state["clock_ends_at"] = (timezone.now() - timedelta(seconds=1)).isoformat()
    session.state = state
    session.save(update_fields=["state"])
    try:
        snapshot_sixty(host_member_id)
        log.append("Časovni bazen potekel (sim).")
    except GameError as exc:
        log.append(f"60s konec ni uspel: {exc.message}")


def _run_solo_match(
    session: GameSession,
    host_member_id: str,
    mode: str,
    accuracy: float,
    max_rounds: int,
    log: list[str],
) -> dict:
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

        host_member = session.room.members.filter(id=host_member_id).first()
        if host_member is None:
            return {"rounds": rounds, "reason": "no_host"}
        if _answer_for(game_question, host_member) is not None:
            if mode == MODE_60_SEKUND:
                rounds += 1
                continue
            try:
                next_question(host_member_id)
            except GameError as exc:
                return {"rounds": rounds, "reason": exc.message}
            rounds += 1
            continue

        msg = _bot_answer_message(game_question, accuracy=accuracy)
        try:
            payloads = submit_answer(host_member_id, msg)
        except GameError as first_exc:
            if mode == MODE_60_SEKUND:
                try:
                    payloads = submit_answer(
                        host_member_id,
                        {
                            "type": "submit_answer",
                            "game_question_id": str(game_question.id),
                            "skip": True,
                        },
                    )
                except GameError as exc:
                    log.append(f"  · napaka pri oddaji: {exc.message}")
                    return {"rounds": rounds, "reason": first_exc.message}
            else:
                try:
                    payloads = submit_answer(
                        host_member_id,
                        {
                            "type": "submit_answer",
                            "game_question_id": str(game_question.id),
                            "timeout": True,
                        },
                    )
                except GameError as exc:
                    log.append(f"  · napaka pri oddaji: {exc.message}")
                    return {"rounds": rounds, "reason": first_exc.message}

        mark = "?"
        if payloads:
            body = payloads[0]
            fb = body.get("feedback") or {}
            if body.get("is_correct") is True or fb.get("is_correct") is True:
                mark = "prav"
            elif body.get("is_correct") is False or fb.get("is_correct") is False:
                mark = "narobe"
            elif fb.get("skipped"):
                mark = "preskok"
            elif body.get("phase") == "finished":
                mark = "konec"
            elif body.get("phase") in {"question", "review"}:
                mark = "oddano"
        log.append(f"  · {mark}")

        session.refresh_from_db()
        if session.status != "active":
            return {"rounds": rounds + 1, "reason": (session.state or {}).get("reason") or "finished"}

        rounds += 1
        phase = (payloads[0].get("phase") if payloads else "") or ""
        if phase == "finished":
            return {"rounds": rounds, "reason": "finished"}

        if mode == MODE_60_SEKUND:
            continue

        if phase == "review":
            try:
                nxt = next_question(host_member_id)
                nphase = (nxt[0].get("phase") if nxt else "") or ""
                if nphase == "finished":
                    return {"rounds": rounds, "reason": "finished"}
                log.append("  → naslednje vprašanje")
            except GameError as exc:
                log.append(f"  → konec: {exc.message}")
                return {"rounds": rounds, "reason": exc.message}

    log.append("Dosežena meja rund.")
    return {"rounds": rounds, "reason": "max_rounds"}
