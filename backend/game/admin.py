from django.contrib import admin

from game.bonus_models import BonusDefinition, PhoneFriend
from game.models import GameQuestion, GameResult, GameSession, PlayerAnswer


@admin.register(BonusDefinition)
class BonusDefinitionAdmin(admin.ModelAdmin):
    list_display = ("name", "key", "bonus_kind", "effect_key", "is_active", "order")
    list_filter = ("bonus_kind", "is_active")
    search_fields = ("name", "key", "effect_key")


@admin.register(PhoneFriend)
class PhoneFriendAdmin(admin.ModelAdmin):
    list_display = ("name", "key", "title", "reliability", "is_active", "order")
    list_filter = ("is_active",)
    search_fields = ("name", "key", "title")


class GameQuestionInline(admin.TabularInline):
    model = GameQuestion
    extra = 0
    readonly_fields = ("question", "order", "started_at", "ended_at")
    can_delete = False


@admin.register(GameSession)
class GameSessionAdmin(admin.ModelAdmin):
    list_display = ("room", "mode", "status", "total_questions", "started_at")
    readonly_fields = ("room", "mode", "status", "total_questions", "current_question_index", "time_limit_seconds", "state", "started_at", "finished_at", "created_at")
    inlines = [GameQuestionInline]

    def has_add_permission(self, request):
        return False


@admin.register(GameResult)
class GameResultAdmin(admin.ModelAdmin):
    list_display = ("nickname", "score", "prize_reached", "correct_count", "total_questions", "reason", "played_at", "is_guest")
    list_filter = ("mode", "reason", "is_guest")
    search_fields = ("nickname", "room_code")
    readonly_fields = (
        "game_session",
        "user",
        "nickname",
        "mode",
        "score",
        "prize_reached",
        "speed_bonus",
        "correct_count",
        "total_questions",
        "duration_ms",
        "is_guest",
        "reason",
        "room_code",
        "played_at",
    )

    def has_add_permission(self, request):
        return False


@admin.register(PlayerAnswer)
class PlayerAnswerAdmin(admin.ModelAdmin):
    list_display = ("room_member", "game_question", "is_correct", "points", "time_taken_ms")
    readonly_fields = ("game_question", "room_member", "selected_option", "answer_data", "is_correct", "answered_at", "time_taken_ms", "points")

    def has_add_permission(self, request):
        return False
