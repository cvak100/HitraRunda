"""Uvoz držav iz JSON paketov (*_drzave.json v geo/data/)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from geo.models import Country

DATA_DIR = Path(__file__).resolve().parent / "data"
# Združljivost: stari enojni seed, če še obstaja.
SEED_PATH = DATA_DIR / "countries_seed.json"
SEED_GLOB = "*_drzave.json"

CONTINENT_LABELS = {
    "africa": "Afrika",
    "antarctica": "Antarktika",
    "asia": "Azija",
    "europe": "Evropa",
    "north_america": "Severna Amerika",
    "south_america": "Južna Amerika",
    "oceania": "Oceanija",
}

SUBREGION_LABELS = {
    "western_europe": "Zahodna Evropa",
    "eastern_europe": "Vzhodna Evropa",
    "northern_europe": "Severna Evropa",
    "southern_europe": "Južna Evropa",
    "central_europe": "Srednja Evropa",
    "western_south_america": "Zahodna Južna Amerika",
    "eastern_south_america": "Vzhodna Južna Amerika",
    "northern_south_america": "Severna Južna Amerika",
    "southern_south_america": "Južna Južna Amerika",
    "central_south_america": "Srednja Južna Amerika",
}


def seed_paths() -> list[Path]:
    """Vsi seed paketi držav (razvrščeni po imenu)."""
    paths = sorted(DATA_DIR.glob(SEED_GLOB))
    if paths:
        return paths
    if SEED_PATH.is_file():
        return [SEED_PATH]
    return []


def load_payload(raw: str | bytes | dict | list) -> dict:
    if isinstance(raw, (str, bytes)):
        data = json.loads(raw)
    else:
        data = raw
    if isinstance(data, list):
        return {"version": 1, "countries": data}
    if not isinstance(data, dict) or "countries" not in data:
        raise ValueError("Pričakovan objekt z 'countries' ali seznam držav.")
    return data


def upsert_country(item: dict[str, Any]) -> tuple[Country, bool]:
    iso2 = str(item.get("iso2") or "").strip().lower()
    if len(iso2) != 2:
        raise ValueError(f"Neveljaven iso2: {iso2!r}")
    name = item.get("name") or {}
    name_sl = str(name.get("sl") or item.get("name_sl") or "").strip()
    if not name_sl:
        raise ValueError(f"{iso2}: manjka name.sl")
    flag = item.get("flag") or {}
    if isinstance(flag, str):
        flag_code = flag.strip().lower() or iso2
    else:
        flag_code = str(flag.get("code") or iso2).strip().lower()
    capital = item.get("capital") or {}
    quiz = item.get("quiz") or {}
    politics = item.get("politics") or {}
    geography = item.get("geography") or {}
    continent = str(
        item.get("continent") or geography.get("continent") or ""
    ).strip().lower()
    if not continent:
        raise ValueError(f"{iso2}: manjka continent")
    subregion = str(
        item.get("subregion") or geography.get("subregion") or ""
    ).strip().lower()
    try:
        difficulty = int(quiz.get("difficulty") or item.get("difficulty") or 1)
    except (TypeError, ValueError):
        difficulty = 1
    active = bool(politics.get("active", item.get("active", True)))
    quiz_exclude = bool(politics.get("quiz_exclude", item.get("quiz_exclude", False)))

    defaults = {
        "iso3": str(item.get("iso3") or "").strip().lower(),
        "name_sl": name_sl,
        "name_en": str(name.get("en") or "").strip(),
        "continent": continent,
        "subregion": subregion,
        "flag_code": flag_code,
        "capital_sl": str(capital.get("sl") or "").strip(),
        "capital_en": str(capital.get("en") or "").strip(),
        "difficulty": max(1, min(5, difficulty)),
        "active": active,
        "quiz_exclude": quiz_exclude,
        "data": item,
    }
    obj, created = Country.objects.update_or_create(iso2=iso2, defaults=defaults)
    return obj, created


def import_countries(raw: str | bytes | dict | list, *, only_new: bool = False) -> dict:
    payload = load_payload(raw)
    created = updated = skipped = 0
    errors: list[str] = []
    for index, item in enumerate(payload.get("countries") or []):
        if not isinstance(item, dict):
            errors.append(f"#{index}: ni objekt")
            continue
        iso2 = str(item.get("iso2") or "").strip().lower()
        try:
            if only_new and iso2 and Country.objects.filter(pk=iso2).exists():
                skipped += 1
                continue
            _, was_created = upsert_country(item)
            if was_created:
                created += 1
            else:
                updated += 1
        except Exception as exc:  # noqa: BLE001 — poročilo uvoza
            errors.append(f"{iso2 or '#'+str(index)}: {exc}")
    return {
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "errors": errors,
        "total": Country.objects.count(),
    }


def import_seed_files(*, only_new: bool = False) -> dict:
    """Uvozi vse pakete iz geo/data/*_drzave.json."""
    paths = seed_paths()
    if not paths:
        return {
            "created": 0,
            "updated": 0,
            "skipped": 0,
            "errors": ["Ni seed paketov (*_drzave.json) v geo/data/."],
            "total": Country.objects.count(),
            "files": [],
        }
    created = updated = skipped = 0
    errors: list[str] = []
    files: list[str] = []
    for path in paths:
        files.append(path.name)
        report = import_countries(path.read_text(encoding="utf-8"), only_new=only_new)
        created += int(report.get("created") or 0)
        updated += int(report.get("updated") or 0)
        skipped += int(report.get("skipped") or 0)
        for err in report.get("errors") or []:
            errors.append(f"{path.name}: {err}")
    return {
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "errors": errors,
        "total": Country.objects.count(),
        "files": files,
    }


def ensure_seed_countries() -> dict:
    """Ob prazni tabeli uvozi vse seed pakete (prva inštalacija)."""
    if Country.objects.exists():
        return {
            "created": 0,
            "updated": 0,
            "skipped": Country.objects.count(),
            "errors": [],
            "total": Country.objects.count(),
            "files": [],
        }
    return import_seed_files(only_new=False)


def quiz_countries(
    *,
    continent: str | None = None,
    continents: list[str] | None = None,
    subregions: list[str] | None = None,
):
    qs = Country.objects.filter(active=True, quiz_exclude=False)
    region_list = [str(s).strip().lower() for s in (subregions or []) if str(s).strip()]
    if region_list:
        return qs.filter(subregion__in=region_list)
    cont_list = [str(c).strip().lower() for c in (continents or []) if str(c).strip()]
    if continent and not cont_list:
        cont_list = [continent.strip().lower()]
    if cont_list:
        qs = qs.filter(continent__in=cont_list)
    return qs


def continent_options() -> list[dict]:
    rows = (
        quiz_countries()
        .values_list("continent")
        .distinct()
        .order_by("continent")
    )
    out = []
    for (slug,) in rows:
        count = quiz_countries(continents=[slug]).count()
        if count < 4:
            continue
        out.append(
            {
                "id": slug,
                "label": CONTINENT_LABELS.get(slug, slug.replace("_", " ").title()),
                "count": count,
            }
        )
    return out


def subregion_options() -> list[dict]:
    rows = (
        quiz_countries()
        .exclude(subregion="")
        .values_list("subregion")
        .distinct()
        .order_by("subregion")
    )
    out = []
    for (slug,) in rows:
        count = quiz_countries(subregions=[slug]).count()
        if count < 1:
            continue
        out.append(
            {
                "id": slug,
                "label": SUBREGION_LABELS.get(slug, slug.replace("_", " ").title()),
                "count": count,
            }
        )
    return out
