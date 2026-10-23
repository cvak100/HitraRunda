from django.db.models import F, Q
from django.shortcuts import get_object_or_404
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.staff import StaffOnly
from game.models import GameResult, GameSession
from game.replay import session_detail


def result_payload(result):
    return {
        "id": result.id,
        "session_id": result.game_session_id,
        "room_code": result.room_code,
        "nickname": result.nickname,
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
        return Response({"ok": True})


class LeaderboardView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        limit, error = _bounded_limit(request.query_params.get("limit"), {"10", "100"}, 10)
        if error:
            return error
        results = GameResult.objects.filter(score__gt=0)
        mode = str(request.query_params.get("mode") or "").strip()
        if mode == "millionaire":
            mode = "hitrarunda"
        if mode:
            if mode == "hitrarunda":
                results = results.filter(mode__in=["hitrarunda", "millionaire"])
            else:
                results = results.filter(mode=mode)
        query = str(request.query_params.get("q") or "").strip()
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
        results = request.user.game_results.order_by("-played_at")
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
        from django.db.models import Max

        from game.modes import MODE_ALA_MILIJONAR, MODE_HITRARUNDA, MODE_LABELS

        base = request.user.game_results.all()
        modes = [
            {
                "mode": MODE_HITRARUNDA,
                "label": MODE_LABELS[MODE_HITRARUNDA],
                "best_score": base.filter(mode__in=[MODE_HITRARUNDA, "millionaire"]).aggregate(v=Max("score"))["v"]
                or 0,
                "games": base.filter(mode__in=[MODE_HITRARUNDA, "millionaire"]).count(),
            },
            {
                "mode": MODE_ALA_MILIJONAR,
                "label": MODE_LABELS[MODE_ALA_MILIJONAR],
                "best_score": base.filter(mode=MODE_ALA_MILIJONAR).aggregate(v=Max("score"))["v"] or 0,
                "games": base.filter(mode=MODE_ALA_MILIJONAR).count(),
            },
        ]
        recent = [result_payload(row) for row in base.order_by("-played_at")[:20]]
        return Response(
            {
                "nickname": request.user.nickname,
                "modes": modes,
                "recent": recent,
            }
        )


class ResultDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, pk):
        result = get_object_or_404(GameResult.objects.select_related("game_session__room"), pk=pk)
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
        return Response(session_detail(session))


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
