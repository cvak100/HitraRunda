from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("rooms", "0003_room_activity_closed_bots"),
    ]

    operations = [
        migrations.AddField(
            model_name="roommember",
            name="connection_epoch",
            field=models.PositiveIntegerField(default=0),
        ),
    ]
