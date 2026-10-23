from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("rooms", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="roommember",
            name="is_bot",
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name="roommember",
            name="user",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="room_memberships",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
