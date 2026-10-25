import json

from django.contrib import admin
from django.utils.html import format_html

from geo.models import Country


@admin.register(Country)
class CountryAdmin(admin.ModelAdmin):
    list_display = (
        "flag_badge",
        "iso2",
        "name_sl",
        "name_en",
        "continent",
        "subregion",
        "capital_sl",
        "difficulty",
        "active",
        "quiz_exclude",
    )
    list_display_links = ("iso2", "name_sl")
    list_filter = ("continent", "subregion", "active", "quiz_exclude", "difficulty")
    search_fields = ("iso2", "iso3", "name_sl", "name_en", "capital_sl", "capital_en", "flag_code")
    list_editable = ("difficulty", "active", "quiz_exclude")
    ordering = ("name_sl",)
    readonly_fields = ("data_pretty",)
    fieldsets = (
        (
            "Osnovno",
            {"fields": ("iso2", "iso3", "name_sl", "name_en", "flag_code")},
        ),
        (
            "Lokacija",
            {"fields": ("continent", "subregion", "capital_sl", "capital_en")},
        ),
        (
            "Kviz",
            {"fields": ("difficulty", "active", "quiz_exclude")},
        ),
        (
            "Polni podatki (JSON)",
            {
                "fields": ("data_pretty", "data"),
                "description": "Celoten paket (meje, jeziki, reke, mesta, …). "
                "Uredi v polju spodaj; predogled je samo za branje.",
            },
        ),
    )

    @admin.display(description="Zastava", ordering="flag_code")
    def flag_badge(self, obj):
        flag = (obj.data or {}).get("flag") or {}
        emoji = flag.get("emoji") or ""
        code = (obj.flag_code or obj.iso2 or "").lower()
        if emoji:
            return format_html('<span style="font-size:1.4rem" title="{}">{}</span>', code, emoji)
        return code

    @admin.display(description="Predogled JSON")
    def data_pretty(self, obj):
        if not obj or not obj.data:
            return "—"
        text = json.dumps(obj.data, ensure_ascii=False, indent=2)
        return format_html(
            '<pre style="max-height:28rem;overflow:auto;white-space:pre-wrap;'
            'font-size:12px;line-height:1.35;background:#111;color:#eee;'
            'padding:12px;border-radius:8px">{}</pre>',
            text,
        )
