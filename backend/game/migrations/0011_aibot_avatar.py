from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("game", "0010_siteconfig"),
    ]

    operations = [
        migrations.AddField(
            model_name="aibot",
            name="avatar",
            field=models.CharField(blank=True, default="", max_length=40),
        ),
    ]
