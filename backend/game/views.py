from django.contrib.auth import get_user_model
from django.db.models import Avg, F, Max, Q, Sum
from django.shortcuts import get_object_or_404
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.nicknames import resolve_avatar_key
from accounts.staff import StaffOnly
from game.leaderboard_stats import totals_for_users, user_mode_totals
from game.models import GameResult, GameSession
from game.replay import session_detail

User = get_user_model()


def result_payload(result):
    user = getattr(result, "user", None)
    preferred_color = getattr(user, "preferred_color", "") if user is not None else ""
    return {
        "id": result.id,
        "session_id": result.game_session_id,
        "room_code": result.room_code,
        "nickname": result.nickname,
        "avatar": resolve_avatar_key(
            avatar=getattr(user, "avatar", "") if user is not None else "",
            nickname=result.nickname,
            seed=str(result.id),
        ),
        "preferred_color": preferred_color or "",
        "mode": result.mode,
        "score": result.score,
        "prize_reached": result.prize_reached,
        "speed_bonus": result.speed_bonus,
        "correct_count": result.correct_count,
        "total_questions": result.total_questions,
        "duration_ms": result.duration_ms,
        "reason": result.reason,
        "played_at": result.played_at.isoformat(),
        "is_guest": result.is_guest,
    }


def _bounded_limit(raw, allowed, default):
    if raw in (None, ""):
        return default, None
    if str(raw) == "all":
        return None, None
    if str(raw) not in allowed:
        return None, Response({"detail": "Neznano število zadetkov."}, status=400)
    return int(raw), None


class HealthView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        from django.conf import settings

        return Response({"ok": True, "version": getattr(settings, "APP_VERSION", "")})


def _normalize_board_mode(mode: str) -> str:
    mode = str(mode or "").strip()
    if mode == "millionaire":
        return "hitrarunda"
    return mode


def _mode_filter_q(mode: str) -> Q | None:
    mode = _normalize_board_mode(mode)
    if not mode:
        return None
    if mode == "hitrarunda":
        return Q(mode__in=["hitrarunda", "millionaire"])
    return Q(mode=mode)


def _totals_leaderboard(limit, query: str, mode: str):
    """Skupna lestvica po uporabniku znotraj enega načina: vsota točk, igre, zmage (MP/Dirka).

    Zmage: en zmagovalec na sejo (score → pravilni → čas → played_at).
    Gosti po cleanup (user SET_NULL) izpadejo iz agregatov — glej leaderboard_stats.
    """
    mode = _normalize_board_mode(mode)
    rows, total = totals_for_users(mode, query=query, limit=limit)
    user_ids = [row["user_id"] for row in rows]
    users = {
        user.id: user
        for user in User.objects.filter(id__in=user_ids).only(
            "id", "nickname", "avatar", "preferred_color", "email"
        )
    }
    results = []
    for row in rows:
        user = users.get(row["user_id"])
        nickname = (user.nickname if user and user.nickname else "") or ""
        if not nickname:
            last = (
                GameResult.objects.filter(user_id=row["user_id"])
                .order_by("-played_at")
                .values_list("nickname", flat=True)
                .first()
            )
            nickname = last or f"Igralec {row['user_id']}"
        results.append(
            {
                "user_id": row["user_id"],
                "nickname": nickname,
                "avatar": resolve_avatar_key(
                    avatar=getattr(user, "avatar", "") if user else "",
                    nickname=nickname,
                    seed=str(row["user_id"]),
                ),
                "preferred_color": (getattr(user, "preferred_color", "") if user else "") or "",
                "total_points": row["total_points"],
                "wins": row["wins"],
                "games": row["games"],
                "is_guest": bool(user.is_guest) if user is not None else False,
            }
        )
    return Response({"kind": "totals", "mode": mode, "results": results, "total": total})


class LeaderboardView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        limit, error = _bounded_limit(request.query_params.get("limit"), {"10", "100"}, 10)
        if error:
            return error
        mode = _normalize_board_mode(request.query_params.get("mode") or "")
        view = str(request.query_params.get("view") or "").strip().lower()
        query = str(request.query_params.get("q") or "").strip()
        if view in ("totals", "skupno", "overall"):
            return _totals_leaderboard(limit, query, mode)

        results = GameResult.objects.filter(score__gt=0, counts_for_leaderboard=True).select_related("user")
        mode_q = _mode_filter_q(mode)
        if mode_q is not None:
            results = results.filter(mode_q)
        if query:
            results = results.filter(nickname__icontains=query)
        results = results.order_by(
            "-score",
            "-correct_count",
            F("duration_ms").asc(nulls_last=True),
            "played_at",
        )
        total = results.count()
        if limit is not None:
            results = results[:limit]
        return Response({"results": [result_payload(result) for result in results], "total": total})


class MyResultsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        results = request.user.game_results.select_related("user").order_by("-played_at")
        mode = str(request.query_params.get("mode") or "").strip()
        if mode == "millionaire":
            mode = "hitrarunda"
        if mode == "hitrarunda":
            results = results.filter(mode__in=["hitrarunda", "millionaire"])
        elif mode:
            results = results.filter(mode=mode)
        query = str(request.query_params.get("q") or "").strip()
        if query:
            results = results.filter(Q(nickname__icontains=query) | Q(room_code__icontains=query))
        total = results.count()
        results = results[:100]
        return Response({"results": [result_payload(result) for result in results], "total": total})


class ProfileStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from game.modes import (
            MODE_60_SEKUND,
            MODE_ALA_MILIJONAR,
            MODE_DIRKA,
            MODE_HITRARUNDA,
            MODE_LABELS,
            MODE_MULTIPLAYER,
        )

        base = request.user.game_results.all()
        mode_filters = [
            (MODE_HITRARUNDA, [MODE_HITRARUNDA, "millionaire"]),
            (MODE_ALA_MILIJONAR, [MODE_ALA_MILIJONAR]),
            (MODE_MULTIPLAYER, [MODE_MULTIPLAYER]),
            (MODE_DIRKA, [MODE_DIRKA]),
            (MODE_60_SEKUND, [MODE_60_SEKUND]),
        ]
        modes = []
        for mode_key, mode_values in mode_filters:
            qs = base.filter(mode__in=mode_values)
            board_qs = GameResult.objects.filter(
                score__gt=0,
                counts_for_leaderboard=True,
                mode__in=mode_values,
            )
            best = (
                qs.filter(score__gt=0, counts_for_leaderboard=True)
                .order_by("-score", "-correct_count", F("duration_ms").asc(nulls_last=True), "played_at")
                .first()
            )
            rank = None
            if best is not None:
                ahead = Q(score__gt=best.score) | Q(score=best.score, correct_count__gt=best.correct_count)
                if best.duration_ms is None:
                    ahead = ahead | Q(score=best.score, correct_count=best.correct_count, duration_ms__isnull=False)
                else:
                    ahead = ahead | Q(
                        score=best.score,
                        correct_count=best.correct_count,
                        duration_ms__isnull=False,
                        duration_ms__lt=best.duration_ms,
                    )
                rank = board_qs.filter(ahead).count() + 1
            aggregates = qs.aggregate(
                best_score=Max("score"),
                best_correct=Max("correct_count"),
                best_prize=Max("prize_reached"),
                avg_score=Avg("score"),
            )
            totals = user_mode_totals(request.user.id, mode_values)
            modes.append(
                {
                    "mode": mode_key,
                    "label": MODE_LABELS[mode_key],
                    "best_score": aggregates["best_score"] or 0,
                    "best_correct": aggregates["best_correct"] or 0,
                    "best_prize": aggregates["best_prize"] or 0,
                    "avg_score": int(round(aggregates["avg_score"] or 0)),
                    "games": qs.count(),
                    "total_points": totals["total_points"],
                    "wins": totals["wins"],
                    "rank": rank,
                    "board_total": board_qs.count(),
                    "best_duration_ms": best.duration_ms if best is not None else None,
                    "best_correct_in_run": best.correct_count if best is not None else 0,
                    "best_total_in_run": best.total_questions if best is not None else 0,
                }
            )
        recent = [
            result_payload(row) for row in base.select_related("user").order_by("-played_at")[:20]
        ]
        return Response(
            {
                "nickname": request.user.nickname,
                "avatar": request.user.avatar or "",
                "preferred_color": request.user.preferred_color or "",
                "modes": modes,
                "recent": recent,
            }
        )


class ResultDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, pk):
        result = get_object_or_404(
            GameResult.objects.select_related("game_session__room", "user"),
            pk=pk,
        )
        is_owner = request.user.is_authenticated and result.user_id == request.user.id
        is_staff = request.user.is_authenticated and request.user.is_staff
        if result.score <= 0 and not is_owner and not is_staff:
            return Response({"detail": "Ta rezultat ni javen."}, status=404)
        if result.game_session_id is None:
            body = result_payload(result)
            body.update(
                {
                    "result_id": result.id,
                    "code": result.room_code,
                    "status": "finished",
                    "stages": [],
                    "missing_session": True,
                }
            )
            return Response(body)
        session = result.game_session
        if session.status != "finished" and not is_staff:
            return Response({"detail": "Igra še ni zaključena."}, status=404)
        return Response(session_detail(session, result=result, for_user=result.user))


class AdminSessionListView(APIView):
    permission_classes = [StaffOnly]

    def get(self, request):
        sessions = GameSession.objects.select_related("room").order_by("-created_at")
        query = str(request.query_params.get("q") or "").strip()
        if query:
            sessions = sessions.filter(Q(room__code__icontains=query) | Q(result__nickname__icontains=query))
        total = sessions.count()
        rows = []
        for session in sessions[:100]:
            result = _result(session)
            rows.append(
                {
                    "id": session.id,
                    "code": session.room.code,
                    "nickname": result.nickname if result else "",
                    "status": session.status,
                    "score": result.score if result else None,
                    "correct_count": result.correct_count if result else None,
                    "total_questions": session.total_questions,
                    "reason": result.reason if result else "",
                    "played_at": (result.played_at if result else session.created_at).isoformat(),
                }
            )
        return Response({"sessions": rows, "total": total})


class AdminSessionDetailView(APIView):
    permission_classes = [StaffOnly]

    def get(self, request, pk):
        session = get_object_or_404(GameSession.objects.select_related("room"), pk=pk)
        if session.status != "finished":
            return Response({"detail": "Igra še ni zaključena."}, status=404)
        return Response(session_detail(session))


def _result(session):
    return session.results.order_by("-score", "duration_ms", "played_at").first()
