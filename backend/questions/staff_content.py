from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils.text import slugify
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.staff import StaffOnly
from questions.importer import export_payload, import_payload
from questions.models import Category, Question, QuestionReport


def category_payload(category, question_count=None):
    return {
        "id": category.id,
        "slug": category.slug,
        "name": category.name,
        "description": category.description,
        "is_active": category.is_active,
        "order": category.order,
        "question_count": question_count
        if question_count is not None
        else category.questions.filter(is_active=True).count(),
    }


class AdminCategoryListView(APIView):
    permission_classes = [StaffOnly]

    def get(self, request):
        from questions.importer import ensure_categories

        ensure_categories()
        categories = Category.objects.annotate(
            question_count=Count("questions", filter=Q(questions__is_active=True))
        ).order_by("order", "name")
        return Response(
            {
                "categories": [
                    category_payload(category, category.question_count) for category in categories
                ]
            }
        )

    def post(self, request):
        name = str(request.data.get("name") or "").strip()
        if not name:
            return Response({"detail": "Ime je obvezno."}, status=400)
        slug = str(request.data.get("slug") or slugify(name) or "").strip()
        if not slug:
            return Response({"detail": "Slug je obvezen."}, status=400)
        if Category.objects.filter(slug=slug).exists():
            return Response({"detail": "Slug že obstaja."}, status=400)
        try:
            order = int(request.data.get("order", 0))
        except (TypeError, ValueError):
            return Response({"detail": "Vrstni red mora biti število."}, status=400)
        category = Category.objects.create(
            name=name[:50],
            slug=slug[:50],
            description=str(request.data.get("description") or "").strip(),
            is_active=bool(request.data.get("is_active", True)),
            order=order,
        )
        return Response({"category": category_payload(category)})


class AdminCategoryDetailView(APIView):
    permission_classes = [StaffOnly]

    def post(self, request, pk):
        category = get_object_or_404(Category, pk=pk)
        name = str(request.data.get("name") or category.name).strip()
        slug = str(request.data.get("slug") or category.slug).strip()
        if not name or not slug:
            return Response({"detail": "Ime in slug sta obvezna."}, status=400)
        if Category.objects.exclude(pk=category.pk).filter(slug=slug).exists():
            return Response({"detail": "Slug že obstaja."}, status=400)
        try:
            order = int(request.data.get("order", category.order))
        except (TypeError, ValueError):
            return Response({"detail": "Vrstni red mora biti število."}, status=400)
        is_active = request.data.get("is_active", category.is_active)
        if not isinstance(is_active, bool):
            return Response({"detail": "is_active mora biti true/false."}, status=400)
        category.name = name[:50]
        category.slug = slug[:50]
        category.description = str(request.data.get("description") or "").strip()
        category.order = order
        category.is_active = is_active
        category.save()
        return Response({"category": category_payload(category)})

    def delete(self, request, pk):
        category = get_object_or_404(Category, pk=pk)
        category.is_active = False
        category.save(update_fields=["is_active"])
        return Response({"detail": "Kategorija je umaknjena.", "category": category_payload(category)})


class AdminQuestionImportView(APIView):
    permission_classes = [StaffOnly]

    def post(self, request):
        raw = request.data.get("payload")
        if raw is None:
            return Response({"detail": "Manjka payload."}, status=400)
        if isinstance(raw, (dict, list)):
            import json

            raw = json.dumps(raw, ensure_ascii=False)
        report = import_payload(raw)
        status = 400 if report["errors"] else 200
        return Response(report, status=status)


class AdminQuestionExportView(APIView):
    permission_classes = [StaffOnly]

    def get(self, request):
        return Response(export_payload())


class AdminQuestionDeactivateActiveView(APIView):
    """Umakne vsa trenutno aktivna vprašanja (is_active=False). Zgodovina sej ostane."""

    permission_classes = [StaffOnly]

    def post(self, request):
        deactivated = Question.objects.filter(is_active=True).update(is_active=False)
        remaining_active = Question.objects.filter(is_active=True).count()
        return Response(
            {
                "deactivated": deactivated,
                "active": remaining_active,
                "detail": f"Umaknjenih {deactivated} aktivnih vprašanj.",
            }
        )


class AdminContentQualityView(APIView):
    permission_classes = [StaffOnly]

    def get(self, request):
        by_category = list(
            Category.objects.annotate(
                active=Count("questions", filter=Q(questions__is_active=True)),
                inactive=Count("questions", filter=Q(questions__is_active=False)),
                reports=Count(
                    "questions__reports",
                    filter=Q(questions__reports__status=QuestionReport.Status.OPEN),
                ),
            )
            .order_by("order", "name")
            .values("slug", "name", "active", "inactive", "reports", "is_active")
        )
        by_type = list(
            Question.objects.values("question_type")
            .annotate(
                active=Count("id", filter=Q(is_active=True)),
                inactive=Count("id", filter=Q(is_active=False)),
            )
            .order_by("question_type")
        )
        by_difficulty = list(
            Question.objects.values("difficulty")
            .annotate(active=Count("id", filter=Q(is_active=True)))
            .order_by("difficulty")
        )
        return Response(
            {
                "totals": {
                    "questions": Question.objects.count(),
                    "active": Question.objects.filter(is_active=True).count(),
                    "inactive": Question.objects.filter(is_active=False).count(),
                    "open_reports": QuestionReport.objects.filter(
                        status=QuestionReport.Status.OPEN
                    ).count(),
                    "categories": Category.objects.count(),
                },
                "by_category": by_category,
                "by_type": by_type,
                "by_difficulty": by_difficulty,
            }
        )
