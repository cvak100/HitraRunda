from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class Category(models.Model):
    name = models.CharField(max_length=50, unique=True)
    slug = models.SlugField(unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = "kategorija"
        verbose_name_plural = "kategorije"
        ordering = ["order", "name"]

    def __str__(self):
        return self.name


class Question(models.Model):
    class Type(models.TextChoices):
        MULTIPLE_CHOICE = "multiple_choice", "Več možnosti"
        TRUE_FALSE = "true_false", "Drži / ne drži"
        MULTI_SELECT = "multi_select", "Več pravilnih"
        ORDERING = "ordering", "Vrstni red"
        MATCHING = "matching", "Povezovanje"
        SLIDER = "slider", "Drsnik"

    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name="questions")
    external_key = models.CharField("ključ", max_length=80, unique=True)
    text = models.TextField()
    difficulty = models.PositiveSmallIntegerField(
        db_index=True,
        validators=[MinValueValidator(1), MaxValueValidator(5)],
    )
    question_type = models.CharField(max_length=30, choices=Type.choices, db_index=True)
    config = models.JSONField(default=dict, blank=True)
    explanation = models.TextField(blank=True)
    image = models.URLField(max_length=500, blank=True, null=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "vprašanje"
        verbose_name_plural = "vprašanja"
        indexes = [
            models.Index(fields=["category", "difficulty", "is_active"]),
        ]
        ordering = ["category__order", "difficulty", "external_key"]

    def __str__(self):
        return self.text[:80]


class QuestionOption(models.Model):
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="options")
    text = models.CharField(max_length=500)
    is_correct = models.BooleanField(default=False)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = "možnost"
        verbose_name_plural = "možnosti"
        unique_together = [("question", "order")]
        ordering = ["order"]

    def __str__(self):
        return self.text[:80]


class QuestionReport(models.Model):
    class Status(models.TextChoices):
        OPEN = "open", "Odprta"
        RESOLVED = "resolved", "Urejena"
        DISMISSED = "dismissed", "Zavržena"

    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="reports")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="question_reports",
    )
    nickname = models.CharField(max_length=30)
    note = models.TextField()
    room_code = models.CharField(max_length=8, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "pritožba"
        verbose_name_plural = "pritožbe"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.nickname}: {self.question.text[:40]}"
