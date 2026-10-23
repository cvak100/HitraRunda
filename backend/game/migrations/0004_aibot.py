from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("game", "0003_gameresult_multiplayer"),
    ]

    operations = [
        migrations.CreateModel(
            name="AiBot",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("key", models.SlugField(max_length=40, unique=True)),
                ("name", models.CharField(max_length=30)),
                ("color", models.CharField(default="#7dcea0", max_length=20)),
                (
                    "accuracy",
                    models.FloatField(
                        default=0.72,
                        help_text="Verjetnost pravilnega odgovora (0–1).",
                        validators=[MinValueValidator(0.0), MaxValueValidator(1.0)],
                    ),
                ),
                (
                    "delay_min",
                    models.FloatField(
                        default=1.2,
                        help_text="Najkrajša zakasnitev odgovora v sekundah.",
                        validators=[MinValueValidator(0.2), MaxValueValidator(60.0)],
                    ),
                ),
                (
                    "delay_max",
                    models.FloatField(
                        default=7.5,
                        help_text="Najdaljša zakasnitev odgovora v sekundah.",
                        validators=[MinValueValidator(0.5), MaxValueValidator(120.0)],
                    ),
                ),
                ("is_active", models.BooleanField(db_index=True, default=True)),
                ("order", models.PositiveSmallIntegerField(default=0)),
            ],
            options={
                "verbose_name": "AI bot",
                "verbose_name_plural": "AI boti",
                "ordering": ["order", "name"],
            },
        ),
    ]
