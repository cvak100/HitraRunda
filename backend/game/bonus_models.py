from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class BonusDefinition(models.Model):
    """
    Katalog bonusov / jokerjev.

    bonus_kind:
      - lifeline: enkratna pomoč v solo (50:50, publika, klic)
      - round: rundni bonus (multiplayer kasneje)
      - main: glavni bonus med igro (multiplayer kasneje)

    effect_key poveže zapis z motorjem (fifty_fifty, audience, phone_friend, …).
    config JSON: max_uses, applies_to_types, …
    modes: seznam mode ključev kjer je bonus na voljo.
    """

    class Kind(models.TextChoices):
        LIFELINE = "lifeline", "Joker / pomoč"
        ROUND = "round", "Rundni bonus"
        MAIN = "main", "Glavni bonus"

    key = models.SlugField(unique=True, max_length=40)
    name = models.CharField(max_length=80)
    description = models.TextField(blank=True)
    bonus_kind = models.CharField(max_length=20, choices=Kind.choices, db_index=True)
    effect_key = models.SlugField(max_length=40, db_index=True)
    modes = models.JSONField(default=list, blank=True)
    config = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = "bonus"
        verbose_name_plural = "bonusi"
        ordering = ["order", "name"]

    def __str__(self):
        return self.name


class PhoneFriend(models.Model):
    """
    Prijatelj za klic v sili.
    specialty_categories: slug-i kategorij kjer je zanesljivejši ([] = univerzalen).
    """

    key = models.SlugField(unique=True, max_length=40)
    name = models.CharField(max_length=40)
    title = models.CharField(max_length=80)
    bio = models.TextField(blank=True)
    specialty_categories = models.JSONField(default=list, blank=True)
    reliability = models.FloatField(
        default=0.75,
        validators=[MinValueValidator(0.0), MaxValueValidator(1.0)],
        help_text="Verjetnost pravilnega nasveta v svoji specialnosti (0–1).",
    )
    out_of_specialty_reliability = models.FloatField(
        default=0.35,
        validators=[MinValueValidator(0.0), MaxValueValidator(1.0)],
        help_text="Verjetnost zunaj specialnosti (0–1).",
    )
    avatar_color = models.CharField(max_length=20, default="#e6b325")
    is_active = models.BooleanField(default=True, db_index=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = "prijatelj"
        verbose_name_plural = "prijatelji"
        ordering = ["order", "name"]

    def __str__(self):
        return f"{self.name} ({self.title})"


class AiBot(models.Model):
    """AI nasprotnik za večigralske sobe."""

    key = models.SlugField(unique=True, max_length=40)
    name = models.CharField(max_length=30)
    color = models.CharField(max_length=20, default="#7dcea0")
    accuracy = models.FloatField(
        default=0.72,
        validators=[MinValueValidator(0.0), MaxValueValidator(1.0)],
        help_text="Verjetnost pravilnega odgovora (0–1).",
    )
    delay_min = models.FloatField(
        default=1.2,
        validators=[MinValueValidator(0.2), MaxValueValidator(60.0)],
        help_text="Najkrajša zakasnitev odgovora v sekundah.",
    )
    delay_max = models.FloatField(
        default=7.5,
        validators=[MinValueValidator(0.5), MaxValueValidator(120.0)],
        help_text="Najdaljša zakasnitev odgovora v sekundah.",
    )
    modes = models.JSONField(
        default=list,
        blank=True,
        help_text="Načini igre, kjer je bot na voljo (npr. multiplayer, dirka).",
    )
    is_active = models.BooleanField(default=True, db_index=True)
    count_for_leaderboard = models.BooleanField(
        default=False,
        help_text="Če je vklopljeno, gre rezultat bota na javno lestvico.",
    )
    # Ključ risanega avatarja (npr. "ris") — glej accounts.nicknames.AVATAR_KEYS.
    avatar = models.CharField(max_length=40, blank=True, default="")
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = "AI bot"
        verbose_name_plural = "AI boti"
        ordering = ["order", "name"]

    def __str__(self):
        return self.name
