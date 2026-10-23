from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("game", "0002_bonuses_friends_modes"),
    ]

    operations = [
        migrations.AlterField(
            model_name="gameresult",
            name="game_session",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="results",
                to="game.gamesession",
            ),
        ),
    ]
