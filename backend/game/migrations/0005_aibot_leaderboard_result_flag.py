from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("game", "0004_aibot"),
    ]

    operations = [
        migrations.AddField(
            model_name="aibot",
            name="count_for_leaderboard",
            field=models.BooleanField(
                default=False,
                help_text="Če je vklopljeno, gre rezultat bota na javno lestvico.",
            ),
        ),
        migrations.AddField(
            model_name="gameresult",
            name="counts_for_leaderboard",
            field=models.BooleanField(db_index=True, default=True),
        ),
    ]
