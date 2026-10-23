from django.conf import settings
from django.db import models

from game.modes import MODE_CHOICES


class GameSession(models.Model):
    room = models.OneToOneField("rooms.Room", on_delete=models.CASCADE, related_name="game_session")
    mode = models.CharField(
        max_length=20,
        choices=MODE_CHOICES,
    )
    status = models.CharField(
        max_length=20,
        default="preparing",
        choices=[
            ("preparing", "Priprava"),
            ("active", "Aktivna"),
            ("finished", "Končana"),
            ("aborted", "Prekinjena"),
        ],
    )
    total_questions = models.PositiveSmallIntegerField()
    current_question_index = models.PositiveSmallIntegerField(default=0)
    time_limit_seconds = models.PositiveSmallIntegerField()
    state = models.JSONField(default=dict)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "igra"
        verbose_name_plural = "igre"

    def __str__(self):
        return f"{self.room.code} ({self.mode})"


class GameQuestion(models.Model):
    game_session = models.ForeignKey(GameSession, on_delete=models.CASCADE, related_name="game_questions")
    question = models.ForeignKey("questions.Question", on_delete=models.PROTECT)
    order = models.PositiveSmallIntegerField()
    presentation = models.JSONField(default=dict, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = [("game_session", "order")]
        ordering = ["order"]

    def __str__(self):
        return f"{self.game_session_id} #{self.order}"


class PlayerAnswer(models.Model):
    game_question = models.ForeignKey(GameQuestion, on_delete=models.CASCADE, related_name="answers")
    room_member = models.ForeignKey("rooms.RoomMember", on_delete=models.CASCADE, related_name="answers")
    selected_option = models.ForeignKey(
        "questions.QuestionOption",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    answer_data = models.JSONField(default=dict, blank=True)
    is_correct = models.BooleanField(null=True)
    answered_at = models.DateTimeField(null=True, blank=True)
    time_taken_ms = models.PositiveIntegerField(null=True, blank=True)
    points = models.IntegerField(default=0)

    class Meta:
        unique_together = [("game_question", "room_member")]


class GameResult(models.Model):
    """Posnetek rezultata. Preživi brisanje gosta in sobe. Pri multiplayerju več zapisov na sejo."""

    game_session = models.ForeignKey(
        GameSession,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="results",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="game_results",
    )
    nickname = models.CharField(max_length=30)
    mode = models.CharField(max_length=20)
    score = models.IntegerField(default=0)
    prize_reached = models.IntegerField(default=0)
    speed_bonus = models.IntegerField(default=0)
    correct_count = models.PositiveSmallIntegerField(default=0)
    total_questions = models.PositiveSmallIntegerField()
    duration_ms = models.PositiveIntegerField(null=True, blank=True)
    is_guest = models.BooleanField(default=False)
    counts_for_leaderboard = models.BooleanField(default=True, db_index=True)
    reason = models.CharField(max_length=20, blank=True)
    room_code = models.CharField(max_length=8, blank=True)
    played_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "rezultat"
        verbose_name_plural = "rezultati"
        ordering = ["-score", "duration_ms", "played_at"]
        indexes = [models.Index(fields=["score", "played_at"])]

    def __str__(self):
        return f"{self.nickname}: {self.score}"


from game.bonus_models import AiBot, BonusDefinition, PhoneFriend  # noqa: E402,F401

