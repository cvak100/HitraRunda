"""Skupne agregacije za lestvico / profil (točke, igre, zmage)."""

from __future__ import annotations

from django.db.models import Count, F, Max, Q, Sum, Window
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


def _session_places_qs(mode: str, places: tuple[int, ...] = (1,)):
    """QuerySet rezultatov z mestom v seji (Window Rank).

    Tie-break znotraj seje: višji score → več pravilnih →
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
        .filter(place__in=places)
    )


def place_by_result_id(result_ids: list[int]) -> dict[int, int]:
    """Mesto v seji za dane GameResult.id (1 = zmaga)."""
    ids = [int(item) for item in result_ids if item]
    if not ids:
        return {}
    base = GameResult.objects.filter(pk__in=ids, game_session_id__isnull=False)
    session_ids = list(base.values_list("game_session_id", flat=True).distinct())
    if not session_ids:
        return {}
    ranked = (
        GameResult.objects.filter(
            game_session_id__in=session_ids,
            counts_for_leaderboard=True,
            score__gt=0,
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
                    F("user_id").asc(nulls_last=True),
                    F("id").asc(),
                ],
            )
        )
        .filter(pk__in=ids)
        .values_list("id", "place")
    )
    return {int(rid): int(place) for rid, place in ranked if place is not None}


def wins_by_user_id(mode: str, user_ids: list[int] | None = None) -> dict[int, int]:
    """Zmage po user_id — Count v DB (brez Python zanke po sejaj)."""
    podium = podium_by_user_id(mode, user_ids)
    return {uid: int(counts.get(1) or 0) for uid, counts in podium.items()}


def podium_by_user_id(mode: str, user_ids: list[int] | None = None) -> dict[int, dict[int, int]]:
    """Število 1./2./3. mest po user_id: {user_id: {1: n, 2: n, 3: n}}.

    Po enem mestu na poizvedbo — Postgres ne dovoli Window + GROUP BY skupaj
    (values(user_id, place).annotate), če place ni konstanta v filtru.
    """
    if mode not in _WIN_MODES:
        return {}
    out: dict[int, dict[int, int]] = {}
    for place in (1, 2, 3):
        qs = _session_places_qs(mode, places=(place,))
        if user_ids is not None:
            qs = qs.filter(user_id__in=user_ids)
        rows = qs.values("user_id").annotate(n=Count("game_session_id", distinct=True))
        for row in rows:
            uid = row.get("user_id")
            if uid is None:
                continue
            bucket = out.setdefault(int(uid), {1: 0, 2: 0, 3: 0})
            bucket[place] = int(row["n"] or 0)
    return out


def totals_for_users(mode: str, query: str = "", limit: int | None = 10) -> tuple[list[dict], int]:
    """Vrne (vrstice {user_id, total_points, games, wins, place_1..3}, total_count)."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    base = board_eligible_qs(mode)
    if query:
        matching_ids = User.objects.filter(nickname__icontains=query).values_list("id", flat=True)
        base = base.filter(Q(user_id__in=matching_ids) | Q(nickname__icontains=query))

    aggregates = list(
        base.values("user_id")
        .annotate(
            total_points=Sum("score"),
            best_score=Max("score"),
            games=Count("id"),
            correct_count=Sum("correct_count"),
            total_questions=Sum("total_questions"),
            last_played_at=Max("played_at"),
        )
        .order_by("-total_points", "-games", "user_id")
    )
    total = len(aggregates)

    user_ids = [row["user_id"] for row in aggregates]
    podium = podium_by_user_id(mode, user_ids) if mode in _WIN_MODES else {}
    rows = []
    for row in aggregates:
        uid = row["user_id"]
        places = podium.get(uid) or {1: 0, 2: 0, 3: 0}
        last_played = row.get("last_played_at")
        rows.append(
            {
                "user_id": uid,
                "total_points": int(row["total_points"] or 0),
                "best_score": int(row["best_score"] or 0),
                "games": int(row["games"] or 0),
                "correct_count": int(row["correct_count"] or 0),
                "total_questions": int(row["total_questions"] or 0),
                "last_played_at": last_played.isoformat() if last_played is not None else None,
                "wins": int(places.get(1) or 0),
                "place_1": int(places.get(1) or 0),
                "place_2": int(places.get(2) or 0),
                "place_3": int(places.get(3) or 0),
            }
        )
    if mode == "dirka":
        rows.sort(
            key=lambda row: (
                -int(row["place_1"]),
                -int(row["place_2"]),
                -int(row["place_3"]),
                -int(row["total_points"]),
                int(row["user_id"]),
            )
        )
    if limit is not None:
        rows = rows[:limit]
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
    place_1 = place_2 = place_3 = 0
    if mode_key in _WIN_MODES:
        places = podium_by_user_id(mode_key, [user_id]).get(user_id) or {1: 0, 2: 0, 3: 0}
        place_1 = int(places.get(1) or 0)
        place_2 = int(places.get(2) or 0)
        place_3 = int(places.get(3) or 0)
        wins = place_1
    return {
        "total_points": int(agg["total_points"] or 0),
        "games": int(agg["games"] or 0),
        "wins": wins,
        "place_1": place_1,
        "place_2": place_2,
        "place_3": place_3,
    }
