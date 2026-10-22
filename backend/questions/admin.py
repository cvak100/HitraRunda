from django.contrib import admin
from django.http import JsonResponse
from django.shortcuts import render
from django.urls import path, reverse

from questions.importer import export_payload, import_payload
from questions.models import Category, Question, QuestionOption, QuestionReport


class QuestionOptionInline(admin.TabularInline):
    model = QuestionOption
    extra = 0
    fields = ("text", "is_correct", "order")
    ordering = ("order",)


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "is_active", "order")
    prepopulated_fields = {"slug": ("name",)}
    ordering = ("order", "name")


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ("text", "category", "question_type", "difficulty", "is_active", "external_key")
    list_filter = ("category", "question_type", "difficulty", "is_active")
    search_fields = ("text", "external_key")
    readonly_fields = ("preview", "created_at", "updated_at")
    inlines = [QuestionOptionInline]
    change_list_template = "admin/questions/question/change_list.html"

    def get_urls(self):
        custom = [
            path(
                "import/",
                self.admin_site.admin_view(self.import_view),
                name="questions_question_import",
            ),
            path(
                "export/",
                self.admin_site.admin_view(self.export_view),
                name="questions_question_export",
            ),
        ]
        return custom + super().get_urls()

    def import_view(self, request):
        report = None
        if request.method == "POST" and request.FILES.get("file"):
            report = import_payload(request.FILES["file"].read())
        context = {
            **self.admin_site.each_context(request),
            "opts": self.model._meta,
            "title": "Uvoz vprašanj",
            "report": report,
        }
        return render(request, "admin/questions/import_questions.html", context)

    def export_view(self, request):
        response = JsonResponse(export_payload(), json_dumps_params={"ensure_ascii": False, "indent": 2})
        response["Content-Disposition"] = 'attachment; filename="vprasanja.json"'
        return response

    def changelist_view(self, request, extra_context=None):
        extra_context = extra_context or {}
        extra_context["import_url"] = reverse("admin:questions_question_import")
        extra_context["export_url"] = reverse("admin:questions_question_export")
        return super().changelist_view(request, extra_context=extra_context)

    @admin.display(description="Predogled")
    def preview(self, obj):
        from django.utils.html import format_html, format_html_join

        if not obj.pk:
            return "Shrani vprašanje za predogled."
        parts = [
            format_html(
                "<p><strong>{}</strong> · {} · težavnost {}</p>",
                obj.get_question_type_display(),
                obj.category,
                obj.difficulty,
            )
        ]
        if obj.question_type == Question.Type.SLIDER:
            config = obj.config or {}
            parts.append(
                format_html(
                    "<p>Obseg {}–{}, korak {}, pravilno {}, toleranca {}.</p>",
                    config.get("min"),
                    config.get("max"),
                    config.get("step"),
                    config.get("correct"),
                    config.get("tolerance"),
                )
            )
        elif obj.question_type == Question.Type.MATCHING:
            pairs = (obj.config or {}).get("pairs") or []
            parts.append(
                format_html(
                    "<ul>{}</ul>",
                    format_html_join("", "<li>{} → {}</li>", ((pair.get("left"), pair.get("right")) for pair in pairs)),
                )
            )
        else:
            rows = []
            for option in obj.options.all():
                mark = "✓" if option.is_correct else "·"
                rows.append((mark, option.text))
            parts.append(format_html("<ul>{}</ul>", format_html_join("", "<li>{} {}</li>", rows)))
        if obj.explanation:
            parts.append(format_html("<p>Razlaga: {}</p>", obj.explanation))
        from django.utils.safestring import mark_safe

        return mark_safe("".join(str(part) for part in parts))


@admin.register(QuestionReport)
class QuestionReportAdmin(admin.ModelAdmin):
    list_display = ("created_at", "status", "nickname", "question", "room_code")
    list_filter = ("status",)
    search_fields = ("note", "nickname", "question__text", "question__external_key", "room_code")
    readonly_fields = ("question", "user", "nickname", "note", "room_code", "created_at", "reviewed_at")
