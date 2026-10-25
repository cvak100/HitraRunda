from django.db import models


class Country(models.Model):
    """Država za ugibanje zastav / geo načine. iso2 = flag-icons koda."""

    iso2 = models.CharField(max_length=2, primary_key=True)
    iso3 = models.CharField(max_length=3, blank=True, default="")
    name_sl = models.CharField(max_length=120)
    name_en = models.CharField(max_length=120, blank=True, default="")
    continent = models.CharField(max_length=32, db_index=True)
    subregion = models.CharField(max_length=64, blank=True, default="", db_index=True)
    flag_code = models.CharField(max_length=8, blank=True, default="")
    capital_sl = models.CharField(max_length=120, blank=True, default="")
    capital_en = models.CharField(max_length=120, blank=True, default="")
    difficulty = models.PositiveSmallIntegerField(default=1)
    active = models.BooleanField(default=True, db_index=True)
    quiz_exclude = models.BooleanField(default=False, db_index=True)
    # borders, currency, languages, rivers, top_cities, lat/lon, …
    data = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "država"
        verbose_name_plural = "države"
        ordering = ["name_sl"]

    def __str__(self):
        return f"{self.name_sl} ({self.iso2})"

    @property
    def flag(self) -> str:
        return (self.flag_code or self.iso2 or "").lower()

    def border_iso2(self) -> list[str]:
        geo = (self.data or {}).get("geography") or {}
        borders = geo.get("borders_iso2") or (self.data or {}).get("borders_iso2") or []
        return [str(x).lower() for x in borders if x]
