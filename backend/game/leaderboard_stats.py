"""Skupne agregacije za lestvico / profil (točke, igre, zmage)."""

from __future__ import annotations

from django.db.models import Count, F, Q, Sum, Window
from django.db.models.functions import Rank

from game.models import GameResult

_WIN_MODES = ("multiplayer", "dirka")


def mode_values(mode: str) -> list[str]:
    mode = str(mode or "").strip()
    if mode == "millionaire":
        mode = "hitrarunda"
    if mode == "hitrarunda":
        return ["hitrarunda", "millionaire"]
    return [mode] if mode else []


def board_eligible_qs(mode: str | None = None):
    """Rezultati, ki štejejo za javno lestvico (zahteva user_id).

    Opomba: po brisanju gosta je GameResult.user SET_NULL — ti zapisi ostanejo
    na per-game lestvici (vzdevek), a izpadejo iz skupnih agregatov po user_id.
    Registracija ohrani skupne točke/zmage.
    """
    qs = GameResult.objects.filter(
        score__gt=0,
        counts_for_leaderboard=True,
        user_id__isnull=False,
    )
    values = mode_values(mode) if mode else []
    if values:
        qs = qs.filter(mode__in=values)
    return qs


def _session_winners_qs(mode: str):
    """QuerySet zmagovalcev sej (place=1) — Window Rank v DB.

    Tie-break znotraj seje (en zmagovalec): višji score → več pravilnih →
    krajši duration_ms → zgodnejši played_at → nižji user_id.
    """
    win_modes = [mode] if mode in _WIN_MODES else []
    if not win_modes:
        return GameResult.objects.none()

    return (
        GameResult.objects.filter(
            counts_for_leaderboard=True,
            mode__in=win_modes,
            game_session_id__isnull=False,
            score__gt=0,
            user_id__isnull=False,
        )
        .annotate(
            place=Window(
                expression=Rank(),
                partition_by=[F("game_session_id")],
                order_by=[
                    F("score").desc(),
                    F("correct_count").desc(),
                    F("duration_ms").asc(nulls_last=True),
                    F("played_at").asc(),
                    F("user_id").asc(),
                ],
            )
        )
        .filter(place=1)
    )


def wins_by_user_id(mode: str, user_ids: list[int] | None = None) -> dict[int, int]:
    """Zmage po user_id — Count v DB (brez Python zanke po sejaj)."""
    if mode not in _WIN_MODES:
        return {}
    qs = _session_winners_qs(mode)
    if user_ids is not None:
        qs = qs.filter(user_id__in=user_ids)
    rows = qs.values("user_id").annotate(wins=Count("game_session_id", distinct=True))
    return {int(row["user_id"]): int(row["wins"] or 0) for row in rows if row["user_id"]}


def totals_for_users(mode: str, query: str = "", limit: int | None = 10) -> tuple[list[dict], int]:
    """Vrne (vrstice {user_id, total_points, games, wins}, total_count)."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    base = board_eligible_qs(mode)
    if query:
        matching_ids = User.objects.filter(nickname__icontains=query).values_list("id", flat=True)
        base = base.filter(Q(user_id__in=matching_ids) | Q(nickname__icontains=query))

    aggregates = list(
        base.values("user_id")
        .annotate(total_points=Sum("score"), games=Count("id"))
        .order_by("-total_points", "-games", "user_id")
    )
    total = len(aggregates)
    if limit is not None:
        aggregates = aggregates[:limit]

    user_ids = [row["user_id"] for row in aggregates]
    win_map = wins_by_user_id(mode, user_ids) if mode in _WIN_MODES else {}
    rows = []
    for row in aggregates:
        uid = row["user_id"]
        rows.append(
            {
                "user_id": uid,
                "total_points": int(row["total_points"] or 0),
                "games": int(row["games"] or 0),
                "wins": int(win_map.get(uid, 0)),
            }
        )
    return rows, total


def user_mode_totals(user_id: int, mode_values_list: list[str]) -> dict:
    """Skupaj točk / igre / zmage za enega userja v načinu."""
    qs = GameResult.objects.filter(
        user_id=user_id,
        score__gt=0,
        counts_for_leaderboard=True,
        mode__in=mode_values_list,
    )
    agg = qs.aggregate(total_points=Sum("score"), games=Count("id"))
    mode_key = mode_values_list[0] if mode_values_list else ""
    wins = 0
    if mode_key in _WIN_MODES:
        wins = wins_by_user_id(mode_key, [user_id]).get(user_id, 0)
    return {
        "total_points": int(agg["total_points"] or 0),
        "games": int(agg["games"] or 0),
        "wins": wins,
    }
