from django.db.models import Count, ProtectedError, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from game.models import GameQuestion, PlayerAnswer
from questions.models import Category, Question, QuestionReport


class CategoryListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        from questions.importer import ensure_categories

        ensure_categories()
        categories = (
            Category.objects.filter(is_active=True)
            .annotate(
                question_count=Count("questions", filter=Q(questions__is_active=True)),
                classic_question_count=Count(
                    "questions",
                    filter=Q(
                        questions__is_active=True,
                        questions__question_type="multiple_choice",
                    ),
                    distinct=True,
                ),
            )
            .order_by("order", "name")
        )
        # Ala milijonar: samo multiple_choice s točno 4 možnostmi.
        # (values+annotate po Count("options") da napačne/prazne vsote — štejemo v Pythonu.)
        from collections import Counter

        ala_counts = Counter(
            Question.objects.filter(is_active=True, question_type="multiple_choice")
            .annotate(option_count=Count("options"))
            .filter(option_count=4)
            .values_list("category__slug", flat=True)
        )
        return Response(
            {
                "categories": [
                    {
                        "slug": category.slug,
                        "name": category.name,
                        "description": category.description,
                        "question_count": category.question_count,
                        "classic_question_count": ala_counts.get(category.slug, 0),
                    }
                    for category in categories
                ]
            }
        )


class StaffOnly(IsAdminUser):
    message = "To je na voljo samo adminu."


def question_payload(question):
    payload = {
        "id": question.id,
        "key": question.external_key,
        "category": question.category.slug,
        "category_name": question.category.name,
        "question_type": question.question_type,
        "difficulty": question.difficulty,
        "text": question.text,
        "explanation": question.explanation,
        "image": question.image,
        "is_active": question.is_active,
        "open_reports": getattr(question, "open_reports", None)
        if hasattr(question, "open_reports")
        else question.reports.filter(status=QuestionReport.Status.OPEN).count(),
    }
    if question.question_type == Question.Type.MATCHING:
        payload["pairs"] = (question.config or {}).get("pairs") or []
    elif question.question_type == Question.Type.SLIDER:
        config = question.config or {}
        payload["slider"] = {
            "min": config.get("min"),
            "max": config.get("max"),
            "step": config.get("step"),
            "correct": config.get("correct"),
            "tolerance": config.get("tolerance"),
        }
    else:
        payload["options"] = [
            {"text": option.text, "correct": option.is_correct, "order": option.order}
            for option in question.options.all()
        ]
    return payload


def report_payload(report):
    return {
        "id": report.id,
        "note": report.note,
        "nickname": report.nickname,
        "room_code": report.room_code,
        "status": report.status,
        "created_at": report.created_at.isoformat(),
        "question": question_payload(report.question),
    }


def _questions():
    return (
        Question.objects.select_related("category")
        .prefetch_related("options")
        .annotate(open_reports=Count("reports", filter=Q(reports__status=QuestionReport.Status.OPEN)))
    )


def _close_open_reports(question):
    question.reports.filter(status=QuestionReport.Status.OPEN).update(
        status=QuestionReport.Status.RESOLVED,
        reviewed_at=timezone.now(),
    )


class ReportCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        game_question_id = request.data.get("game_question_id")
        try:
            game_question = (
                GameQuestion.objects.select_related("question", "game_session__room")
                .filter(pk=game_question_id)
                .first()
            )
        except (TypeError, ValueError):
            game_question = None
        if game_question is None:
            return Response({"detail": "Vprašanje ne obstaja."}, status=404)
        answer = PlayerAnswer.objects.filter(
            game_question=game_question,
            room_member__user=request.user,
        ).select_related("room_member").first()
        if answer is None:
            return Response({"detail": "Pritožbo lahko oddaš po svojem odgovoru."}, status=404)
        note = str(request.data.get("note") or "").strip()
        if len(note) > 1000:
            return Response({"detail": "Pritožba je predolga."}, status=400)
        if not note:
            note = "Vprašanje je napačno."
        report = (
            QuestionReport.objects.filter(
                question=game_question.question,
                user=request.user,
                status=QuestionReport.Status.OPEN,
            )
            .order_by("-created_at")
            .first()
        )
        if report is None:
            report = QuestionReport.objects.create(
                question=game_question.question,
                user=request.user,
                nickname=answer.room_member.nickname_in_room,
                note=note,
                room_code=game_question.game_session.room.code,
            )
        else:
            report.note = note
            report.room_code = game_question.game_session.room.code
            report.save(update_fields=["note", "room_code"])
        return Response({"id": report.id, "detail": "Pritožba je zabeležena."})


def _admin_health():
    from game.admin_health import collect_health

    full = collect_health(detail=False)
    return {
        "ok": full["ok"],
        "db": {"ok": full["db"]["ok"], "detail": full["db"]["detail"]},
        "redis": {
            "ok": full["redis"]["ok"],
            "detail": full["redis"]["detail"],
            "ping_ms": full["redis"].get("ping_ms"),
            "url": full["redis"].get("url"),
        },
    }


class AdminSummaryView(APIView):
    permission_classes = [StaffOnly]

    def get(self, request):
        from datetime import timedelta

        from game.bonus_models import AiBot, BonusDefinition, PhoneFriend
        from game.models import GameResult, GameSession
        from game.modes import MODE_LABELS
        from rooms.models import Room

        now = timezone.now()
        day_ago = now - timedelta(days=1)
        week_ago = now - timedelta(days=7)

        open_reports_qs = QuestionReport.objects.filter(status=QuestionReport.Status.OPEN).select_related(
            "question", "question__category"
        )
        recent_reports = [
            report_payload(report)
            for report in open_reports_qs.prefetch_related("question__options").order_by("-created_at")[:5]
        ]

        recent_sessions = []
        for session in GameSession.objects.select_related("room", "room__host").order_by("-created_at")[:8]:
            result = session.results.order_by("-score").first()
            host_nick = ""
            if session.room_id and session.room.host_id:
                host_nick = session.room.host.nickname or session.room.host.username
            recent_sessions.append(
                {
                    "id": session.id,
                    "code": session.room.code,
                    "mode": session.mode,
                    "mode_label": MODE_LABELS.get(session.mode, session.mode),
                    "status": session.status,
                    "nickname": result.nickname if result else host_nick,
                    "score": result.score if result else None,
                    "created_at": session.created_at.isoformat(),
                }
            )

        results_by_mode = {
            row["mode"]: row["c"]
            for row in GameResult.objects.values("mode").annotate(c=Count("id")).order_by()
        }

        live_rooms = []
        for room in (
            Room.objects.filter(status__in=["waiting", "playing"])
            .select_related("host")
            .prefetch_related("members")
            .order_by("-last_activity")[:12]
        ):
            members = [
                {
                    "id": str(m.id),
                    "nickname": m.nickname_in_room,
                    "is_host": m.is_host,
                    "is_bot": m.is_bot,
                }
                for m in room.members.filter(left_at__isnull=True).order_by("joined_at")
            ]
            live_rooms.append(
                {
                    "code": room.code,
                    "name": room.name,
                    "status": room.status,
                    "mode": (room.settings or {}).get("mode") or "",
                    "mode_label": MODE_LABELS.get((room.settings or {}).get("mode") or "", ""),
                    "member_count": len(members),
                    "max_players": room.max_players,
                    "host_nickname": room.host.nickname if room.host_id else "",
                    "last_activity": room.last_activity.isoformat() if room.last_activity else None,
                    "members": members,
                }
            )

        health = _admin_health()

        return Response(
            {
                "generated_at": now.isoformat(),
                "health": health,
                "questions": Question.objects.count(),
                "active_questions": Question.objects.filter(is_active=True).count(),
                "inactive_questions": Question.objects.filter(is_active=False).count(),
                "categories": Category.objects.filter(is_active=True).count(),
                "open_reports": open_reports_qs.count(),
                "users": User.objects.count(),
                "guests": User.objects.filter(email__isnull=True).count(),
                "registered": User.objects.filter(email__isnull=False).count(),
                "staff": User.objects.filter(is_staff=True).count(),
                "rooms_waiting": Room.objects.filter(status="waiting").count(),
                "rooms_playing": Room.objects.filter(status="playing").count(),
                "rooms_finished_week": Room.objects.filter(status="finished", finished_at__gte=week_ago).count(),
                "sessions_active": GameSession.objects.filter(status__in=["preparing", "active"]).count(),
                "sessions_finished_day": GameSession.objects.filter(status="finished", finished_at__gte=day_ago).count(),
                "sessions_finished_week": GameSession.objects.filter(
                    status="finished", finished_at__gte=week_ago
                ).count(),
                "results_total": GameResult.objects.count(),
                "results_day": GameResult.objects.filter(played_at__gte=day_ago).count(),
                "results_by_mode": [
                    {"mode": mode, "label": MODE_LABELS.get(mode, mode), "count": count}
                    for mode, count in sorted(results_by_mode.items(), key=lambda item: (-item[1], item[0]))
                ],
                "bots": AiBot.objects.filter(is_active=True).count(),
                "friends": PhoneFriend.objects.filter(is_active=True).count(),
                "bonuses": BonusDefinition.objects.filter(is_active=True).count(),
                "live_rooms": live_rooms,
                "recent_reports": recent_reports,
                "recent_sessions": recent_sessions,
                "attention": {
                    "open_reports": open_reports_qs.count(),
                    "live_rooms": Room.objects.filter(status__in=["waiting", "playing"]).count(),
                    "live_sessions": GameSession.objects.filter(status__in=["preparing", "active"]).count(),
                },
            }
        )


class AdminQuestionListView(APIView):
    permission_classes = [StaffOnly]

    def get(self, request):
        questions = _questions().order_by("-open_reports", "category__order", "difficulty", "external_key")
        query = str(request.query_params.get("q") or "").strip()
        if query:
            questions = questions.filter(Q(text__icontains=query) | Q(external_key__icontains=query))
        category = str(request.query_params.get("category") or "").strip()
        if category:
            questions = questions.filter(category__slug=category)
        status = str(request.query_params.get("status") or "all")
        if status == "active":
            questions = questions.filter(is_active=True)
        elif status == "withdrawn":
            questions = questions.filter(is_active=False)
        elif status != "all":
            return Response({"detail": "Neznan filter."}, status=400)
        sorts = {
            "text": "text",
            "category": "category__name",
            "type": "question_type",
            "difficulty": "difficulty",
            "status": "is_active",
            "reports": "open_reports",
        }
        sort = str(request.query_params.get("sort") or "category")
        direction = str(request.query_params.get("dir") or "asc")
        if sort not in sorts or direction not in {"asc", "desc"}:
            return Response({"detail": "Neznano razvrščanje."}, status=400)
        field = sorts[sort]
        if direction == "desc":
            field = f"-{field}"
        questions = questions.order_by(field, "id")
        raw_limit = str(request.query_params.get("limit") or "20")
        total = questions.count()
        if raw_limit == "all":
            rows = list(questions)
        elif raw_limit in {"20", "50", "100", "200"}:
            rows = list(questions[: int(raw_limit)])
        else:
            return Response({"detail": "Neznano število vprašanj."}, status=400)
        return Response(
            {
                "questions": [question_payload(question) for question in rows],
                "total": total,
                "shown": len(rows),
            }
        )


class AdminQuestionDetailView(APIView):
    permission_classes = [StaffOnly]

    def post(self, request, pk):
        from questions.importer import ImportProblem, _clean_item, _upsert

        question = get_object_or_404(Question.objects.select_related("category").prefetch_related("options"), pk=pk)
        data = dict(request.data or {})
        data["key"] = question.external_key
        try:
            cleaned = _clean_item(data, set())
        except ImportProblem as exc:
            return Response({"detail": exc.message}, status=400)
        _upsert(cleaned)
        question = _questions().get(pk=pk)
        return Response({"question": question_payload(question), "detail": "Vprašanje je shranjeno."})

    def delete(self, request, pk):
        question = get_object_or_404(Question, pk=pk)
        _close_open_reports(question)
        try:
            question.delete()
        except ProtectedError:
            question.is_active = False
            question.save(update_fields=["is_active"])
            return Response(
                {
                    "deleted": False,
                    "deactivated": True,
                    "detail": "Vprašanje je že bilo v igri, zato sem ga umaknil iz novih iger.",
                }
            )
        return Response({"deleted": True, "deactivated": False, "detail": "Vprašanje je izbrisano."})


class AdminReportListView(APIView):
    permission_classes = [StaffOnly]

    def get(self, request):
        status = str(request.query_params.get("status") or QuestionReport.Status.OPEN)
        if status not in QuestionReport.Status.values:
            return Response({"detail": "Neznano stanje pritožbe."}, status=400)
        reports = (
            QuestionReport.objects.filter(status=status)
            .select_related("question__category")
            .prefetch_related("question__options")
            .annotate(
                open_reports=Count(
                    "question__reports",
                    filter=Q(question__reports__status=QuestionReport.Status.OPEN),
                )
            )
        )
        # annotate lands on the report, while question_payload reads question.open_reports
        payload = []
        for report in reports[:100]:
            report.question.open_reports = report.open_reports
            payload.append(report_payload(report))
        return Response({"reports": payload})


class AdminReportReviewView(APIView):
    permission_classes = [StaffOnly]

    def post(self, request, pk):
        status = request.data.get("status")
        if status not in {QuestionReport.Status.RESOLVED, QuestionReport.Status.DISMISSED}:
            return Response({"detail": "Pritožbo lahko urediš ali zavržeš."}, status=400)
        report = get_object_or_404(QuestionReport, pk=pk)
        report.status = status
        report.reviewed_at = timezone.now()
        report.save(update_fields=["status", "reviewed_at"])
        return Response({"id": report.id, "status": report.status})
