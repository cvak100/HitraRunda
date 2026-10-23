import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("game", "0004_aibot"),
        ("rooms", "0002_roommember_bots"),
    ]

    operations = [
        migrations.AddField(
            model_name="room",
            name="last_activity",
            field=models.DateTimeField(auto_now_add=True, default=django.utils.timezone.now),
            preserve_default=False,
        ),
        migrations.AlterField(
            model_name="room",
            name="status",
            field=models.CharField(
                choices=[
                    ("waiting", "Čakanje"),
                    ("playing", "V teku"),
                    ("finished", "Končana"),
                    ("closed", "Zaprta"),
                ],
                default="waiting",
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name="roommember",
            name="bot_profile",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="room_members",
                to="game.aibot",
            ),
        ),
    ]
