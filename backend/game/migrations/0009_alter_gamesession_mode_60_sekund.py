from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("game", "0008_aibot_modes"),
    ]

    operations = [
        migrations.AlterField(
            model_name="gamesession",
            name="mode",
            field=models.CharField(
                choices=[
                    ("hitrarunda", "Hitra runda"),
                    ("ala_milijonar", "Ala milijonar"),
                    ("multiplayer", "Hitra tekma"),
                    ("dirka", "Dirka"),
                    ("60_sekund", "60 sekund"),
                ],
                max_length=20,
            ),
        ),
    ]
