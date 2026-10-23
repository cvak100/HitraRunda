"""Skupni pomožniki za admin simulacijo tekem."""

from __future__ import annotations

from accounts.nicknames import resolve_avatar_key
from game.bonus_models import AiBot
from game.engine import GameError, room_name_for, validate_settings
from game.modes import LOBBY_MODES, MP_MIN_PLAYERS
from game.models import GameResult, GameSession
from rooms.models import Room, RoomMember
from rooms.services import _new_code


def sim_response(session: GameSession, mode: str, summary: dict, log: list[str]) -> dict:
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


def resolve_bot_profiles(mode: str, wanted_keys: list[str], bot_count: int, min_needed: int) -> list[AiBot]:
    qs = list(AiBot.objects.filter(is_active=True).order_by("order", "name"))
    if mode in LOBBY_MODES:
        pool = [b for b in qs if mode in (b.modes or [])]
        if not pool:
            pool = qs
    else:
        pool = qs
    if wanted_keys:
        by_key = {b.key: b for b in pool}
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


def create_sim_room(
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


def member_accuracy(member) -> float:
    profile = getattr(member, "bot_profile", None)
    if profile is not None and profile.accuracy is not None:
        return float(profile.accuracy)
    return 0.7


def apply_guest_avatar(host, profile: AiBot) -> None:
    host.avatar = profile.avatar or resolve_avatar_key(nickname=profile.name, seed=profile.key)
    host.preferred_color = (profile.color or host.preferred_color or "#7dcea0")[:20]
    host.save(update_fields=["avatar", "preferred_color"])
