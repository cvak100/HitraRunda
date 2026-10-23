from django.db import migrations, models


def clear_url_avatars(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    User.objects.exclude(avatar__isnull=True).exclude(avatar="").filter(avatar__contains="://").update(avatar="")


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(clear_url_avatars, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="user",
            name="avatar",
            field=models.CharField(blank=True, default="", max_length=40),
        ),
    ]
