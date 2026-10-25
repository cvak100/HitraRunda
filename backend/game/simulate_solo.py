"""Admin simulacija solo načinov: Hitra runda, Ala milijonar, 60 sekund.

Opombe:
- ``play_to_end`` (privzeto True): natančnost 1.0 — bot ne pade po prvi napaki
  (koristno za seed lestvice). Nastavi False za realistično bot natančnost.
- 60 sekund: ura v sim ne teče v živo, zato ob koncu zanke po potrebi
  umetno potekamo časovni bazen (``force_sixty_finish``) — OK samo za admin seed.
"""

from __future__ import annotations

from datetime import timedelta

from django.utils import timezone

from accounts.models import create_guest
from game.engine import GameError, _answer_for, next_question, start_game, submit_answer
from game.modes import MODE_60_SEKUND, MODE_ALA_MILIJONAR, MODE_HITRARUNDA
from game.models import GameResult, GameSession
from game.multiplayer import _bot_answer_message
from game.simulate_common import (
    apply_guest_avatar,
    create_sim_room,
    resolve_bot_profiles,
    sim_response,
)
from game.site_settings import get as site_get
from game.site_settings import get_int_set


def simulate_solo(
    *,
    mode: str,
    raw: dict,
    categories: list,
    wanted_keys: list[str],
    bots_on_board: bool,
    max_rounds: int,
    log: list[str],
) -> dict:
    profiles = resolve_bot_profiles(mode, wanted_keys, bot_count=1, min_needed=1)
    profile = profiles[0]
    # Seed lestvice: privzeto igraj do konca (brez zgodnjega izpada ob napaki).
    play_to_end = bool(raw.get("play_to_end", True))

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

    accuracy = 1.0 if play_to_end else float(profile.accuracy if profile.accuracy is not None else 0.7)
    log.append(f"Način: {mode}")
    log.append(f"Kategorije: {', '.join(categories) if categories else 'vse'}")
    log.append(
        f"Bot profil: {profile.name} ({int(round(accuracy * 100))} %"
        f"{', igraj do konca' if play_to_end else ''})"
    )

    host = create_guest(profile.name[:30])
    apply_guest_avatar(host, profile)
    log.append(f"Igralec: {host.nickname}")

    room = create_sim_room(
        host,
        mode=mode,
        profiles=[],
        categories=categories,
        question_count=question_count,
        time_limit=time_limit,
        sudden_death=False,
        target_score=200,
        safe_every=5,
        friend_keys=[],
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

    session = (
        GameSession.objects.filter(room=room, status__in=["preparing", "active"])
        .order_by("-created_at")
        .first()
    )
    if session is None:
        raise GameError("Seja ni nastala.")
    log.append(f"Seja #{session.id} aktivna")

    summary = run_solo_match(
        session,
        host_member_id=str(host_member.id),
        mode=mode,
        accuracy=accuracy,
        max_rounds=40 if mode == MODE_60_SEKUND else max_rounds,
        log=log,
    )
    session.refresh_from_db()
    if mode == MODE_60_SEKUND and session.status == "active":
        # Umetni timeout: sim ne čaka 60s realnega časa — glej module docstring.
        force_sixty_finish(session, str(host_member.id), log)
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

    return sim_response(session, mode, summary, log)


def force_sixty_finish(session: GameSession, host_member_id: str, log: list[str]) -> None:
    """Simulacija: umetno potek časa, da 60s tekma dobi rezultat (admin seed)."""
    from game.sixty import snapshot_sixty

    state = dict(session.state or {})
    state["clock_ends_at"] = (timezone.now() - timedelta(seconds=1)).isoformat()
    session.state = state
    session.save(update_fields=["state"])
    try:
        snapshot_sixty(host_member_id)
        log.append("Časovni bazen potekel (sim — umetni timeout).")
    except GameError as exc:
        log.append(f"60s konec ni uspel: {exc.message}")


def run_solo_match(
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
