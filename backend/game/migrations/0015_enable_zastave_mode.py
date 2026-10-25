from django.core.cache import cache
from django.db import migrations


CACHE_KEY = "site_config_values_v2"


def enable_zastave(apps, schema_editor):
    SiteConfig = apps.get_model("game", "SiteConfig")
    for row in SiteConfig.objects.all():
        values = dict(row.values or {})
        modes = [str(m).strip() for m in (values.get("enabled_modes") or []) if str(m).strip()]
        if "zastave" in modes:
            continue
        # Če ključa ni, DEFAULTS že vključuje zastave — nič za shraniti.
        if "enabled_modes" not in values and not modes:
            continue
        modes.append("zastave")
        values["enabled_modes"] = modes
        row.values = values
        row.save(update_fields=["values"])
    cache.delete(CACHE_KEY)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("game", "0014_alter_gamesession_mode_zastave"),
    ]

    operations = [
        migrations.RunPython(enable_zastave, noop_reverse),
    ]
