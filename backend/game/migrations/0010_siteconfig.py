from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("game", "0009_alter_gamesession_mode_60_sekund"),
    ]

    operations = [
        migrations.CreateModel(
            name="SiteConfig",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("values", models.JSONField(blank=True, default=dict)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "nastavitve spletnega mesta",
                "verbose_name_plural": "nastavitve spletnega mesta",
            },
        ),
    ]
