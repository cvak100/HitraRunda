from django.db import migrations, models


def seed_bot_modes(apps, schema_editor):
    AiBot = apps.get_model("game", "AiBot")
    for bot in AiBot.objects.all():
        if bot.modes:
            continue
        if bot.key == "dirka":
            bot.modes = ["dirka"]
        else:
            bot.modes = ["multiplayer"]
        bot.save(update_fields=["modes"])


class Migration(migrations.Migration):
    dependencies = [
        ("game", "0007_alter_gamesession_mode_dirka"),
    ]

    operations = [
        migrations.AddField(
            model_name="aibot",
            name="modes",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text="Načini igre, kjer je bot na voljo (npr. multiplayer, dirka).",
            ),
        ),
        migrations.RunPython(seed_bot_modes, migrations.RunPython.noop),
    ]
