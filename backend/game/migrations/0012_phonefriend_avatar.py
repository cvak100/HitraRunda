from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("game", "0011_aibot_avatar"),
    ]

    operations = [
        migrations.AddField(
            model_name="phonefriend",
            name="avatar",
            field=models.CharField(blank=True, default="", max_length=40),
        ),
    ]
