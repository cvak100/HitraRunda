"""Nastavitve iger (admin) — defaulti + override v DB."""

from __future__ import annotations

from copy import deepcopy

from django.core.cache import cache

CACHE_KEY = "site_config_values_v2"
CACHE_TTL = 60

# Privzete vrednosti (enake kot v modes/engine pred admin stranjo).
DEFAULTS: dict = {
    # Načini
    "enabled_modes": [
        "hitrarunda",
        "ala_milijonar",
        "multiplayer",
        "dirka",
        "60_sekund",
    ],
    # Boti (globalni default, če bot nima profila)
    "bot_accuracy": 0.72,
    "bot_delay_min": 1.2,
    "bot_delay_max": 7.5,
    # 60 sekund
    "sixty_start_seconds": 60,
    "sixty_clock_cap": 180,
    "sixty_correct_bonus": 2,
    "sixty_wrong_penalty": 5,
    "sixty_skip_penalty": 2,
    "sixty_skip_limits": [None, 3, 5, 10],
    # Dirka
    "dirka_time_seconds": 30,
    "dirka_base_points": 5,
    "dirka_penalty": 4,
    "dirka_target_scores": [100, 200, 500, 1000],
    "dirka_safe_every": [5, 10],
    "dirka_max_bonus_types": 5,
    "dirka_streak_at": 3,
    "dirka_streak_bonus": 5,
    "dirka_hot_streak_at": 5,
    "dirka_hot_streak_bonus": 10,
    "dirka_steal_min": 2,
    "dirka_steal_max": 4,
    "dirka_comeback_gap": 15,
    "dirka_comeback_mult": 1.3,
    # Hitra tekma
    "mp_correct_points": 100,
    "mp_round_bonus": 50,
    "mp_streak_bonus_2": 25,
    "mp_streak_bonus_3": 50,
    "mp_catchup_bonus": 40,
    "mp_max_players": 6,
    "mp_max_bots": 5,
    "mp_allowed_times": [30, 60, 90, 120, 300],
    "mp_question_counts": [5, 10, 20, 40, 50, 100],
    "mp_round_advance_seconds": 5,
    # Hitra runda
    "hr_allowed_times": [10, 15, 20, 30, 45, 60],
    "hr_max_speed_bonus": 100,
    # Ala milijonar
    "ala_time_seconds": 90,
    "ala_safe_orders": [4, 9],
    "ala_friends_pick": 3,
    "ala_difficulty_targets": [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5],
    "ala_prize_ladder": [
        100,
        200,
        300,
        500,
        1_000,
        2_000,
        4_000,
        8_000,
        16_000,
        32_000,
        64_000,
        125_000,
        250_000,
        500_000,
        1_000_000,
    ],
    # Sobe / gosti
    "room_idle_seconds": 60 * 60,
    "guest_cleanup_days": 7,
    # Vzdevki
    "nickname_adjectives": [
        "Hitri",
        "Tihi",
        "Zlati",
        "Modri",
        "Veseli",
        "Pogumni",
        "Spretni",
        "Mirni",
        "Jasni",
        "Topli",
        "Hladni",
        "Zvesti",
        "Lahki",
        "Ostri",
        "Krasni",
        "Pravi",
    ],
    "nickname_nouns": [
        "Ris",
        "Volk",
        "Orel",
        "Sokol",
        "Medved",
        "Delfin",
        "Jelen",
        "Zmaj",
        "Vitez",
        "Gams",
        "Lev",
        "Tiger",
        "Smuk",
        "Kapetan",
        "Jastreb",
        "Zajec",
        "Kit",
        "Kameleon",
        "Metulj",
        "Krokar",
        "Golob",
        "Labod",
        "Jaguar",
        "Panter",
        "Gepard",
        "Kralj",
        "Knez",
        "Stražar",
        "Lovec",
        "Pionir",
        "Raziskovalec",
        "Navigator",
        "Pilot",
        "Admiral",
        "General",
        "Junak",
        "Feniks",
        "Samorog",
        "Kekec",
        "Rožle",
        "Minotaver",
    ],
}

GROUPS = [
    {
        "id": "modes",
        "label": "Načini",
        "description": "Kateri načini so na voljo igralcem (eden na vrstico).",
    },
    {
        "id": "bots",
        "label": "Boti",
        "description": "Privzeta točnost in zakasnitev, če bot nima lastnega profila.",
    },
    {
        "id": "sixty",
        "label": "60 sekund",
        "description": "Skupni čas, bonusi in kazni ter dovoljeni limiti preskokov.",
    },
    {
        "id": "dirka",
        "label": "Dirka",
        "description": "Čas, točkovanje, cilji, varna zona, streak / steal / comeback.",
    },
    {
        "id": "multiplayer",
        "label": "Hitra tekma",
        "description": "Točke, bonusi, meje in čas samodejnega prehoda runde.",
    },
    {
        "id": "hitrarunda",
        "label": "Hitra runda",
        "description": "Dovoljeni časi na vprašanje in bonus za hitrost.",
    },
    {
        "id": "ala",
        "label": "Ala milijonar",
        "description": "Čas, varne točke, prijatelji, težavnost in nagradna lestvica.",
    },
    {
        "id": "rooms",
        "label": "Sobe",
        "description": "Kdaj se zaprejo neaktivne sobe.",
    },
    {
        "id": "guests",
        "label": "Gosti",
        "description": "Samodejno čiščenje starih gostov.",
    },
    {
        "id": "nicknames",
        "label": "Vzdevki",
        "description": "Besede za naključne gostovske vzdevke.",
    },
]

KNOWN_MODES = {
    "hitrarunda",
    "ala_milijonar",
    "multiplayer",
    "dirka",
    "60_sekund",
}

# type: int | float | int_list | int_list_null | lines | text
FIELDS = [
    {
        "key": "enabled_modes",
        "group": "modes",
        "label": "Vklopljeni načini",
        "type": "lines",
        "help": "hitrarunda, ala_milijonar, multiplayer, dirka, 60_sekund",
    },
    {
        "key": "bot_accuracy",
        "group": "bots",
        "label": "Privzeta točnost (0–1)",
        "type": "float",
        "min": 0,
        "max": 1,
    },
    {
        "key": "bot_delay_min",
        "group": "bots",
        "label": "Min zakasnitev (s)",
        "type": "float",
        "min": 0,
        "max": 60,
    },
    {
        "key": "bot_delay_max",
        "group": "bots",
        "label": "Max zakasnitev (s)",
        "type": "float",
        "min": 0.1,
        "max": 120,
    },
    # 60 s
    {
        "key": "sixty_start_seconds",
        "group": "sixty",
        "label": "Začetni čas (s)",
        "type": "int",
        "min": 10,
        "max": 600,
    },
    {
        "key": "sixty_clock_cap",
        "group": "sixty",
        "label": "Največja ura / cap (s)",
        "type": "int",
        "min": 30,
        "max": 900,
    },
    {
        "key": "sixty_correct_bonus",
        "group": "sixty",
        "label": "Pravilno (+s)",
        "type": "int",
        "min": 0,
        "max": 60,
    },
    {
        "key": "sixty_wrong_penalty",
        "group": "sixty",
        "label": "Napačno (−s)",
        "type": "int",
        "min": 0,
        "max": 60,
    },
    {
        "key": "sixty_skip_penalty",
        "group": "sixty",
        "label": "Preskok (−s)",
        "type": "int",
        "min": 0,
        "max": 60,
    },
    {
        "key": "sixty_skip_limits",
        "group": "sixty",
        "label": "Dovoljeni limiti preskokov",
        "type": "int_list_null",
        "help": "Števila ločena z vejico. Za neomejeno dodaj »n« ali »neomejeno« (npr. n,3,5,10).",
    },
    # Dirka
    {
        "key": "dirka_time_seconds",
        "group": "dirka",
        "label": "Čas na vprašanje (s)",
        "type": "int",
        "min": 5,
        "max": 300,
    },
    {
        "key": "dirka_base_points",
        "group": "dirka",
        "label": "Osnovne točke",
        "type": "int",
        "min": 1,
        "max": 100,
    },
    {
        "key": "dirka_penalty",
        "group": "dirka",
        "label": "Kazen (točke)",
        "type": "int",
        "min": 0,
        "max": 100,
    },
    {
        "key": "dirka_target_scores",
        "group": "dirka",
        "label": "Cilji točk",
        "type": "int_list",
        "help": "Npr. 100, 200, 500, 1000",
    },
    {
        "key": "dirka_safe_every",
        "group": "dirka",
        "label": "Varna zona vsakih N pravilnih",
        "type": "int_list",
        "help": "Npr. 5, 10",
    },
    {
        "key": "dirka_max_bonus_types",
        "group": "dirka",
        "label": "Max različnih tipov bonusov",
        "type": "int",
        "min": 1,
        "max": 20,
    },
    {
        "key": "dirka_streak_at",
        "group": "dirka",
        "label": "Streak pri N pravilnih",
        "type": "int",
        "min": 2,
        "max": 20,
    },
    {
        "key": "dirka_streak_bonus",
        "group": "dirka",
        "label": "Streak bonus (točke)",
        "type": "int",
        "min": 0,
        "max": 100,
    },
    {
        "key": "dirka_hot_streak_at",
        "group": "dirka",
        "label": "Hot streak pri N",
        "type": "int",
        "min": 2,
        "max": 30,
    },
    {
        "key": "dirka_hot_streak_bonus",
        "group": "dirka",
        "label": "Hot streak bonus (točke)",
        "type": "int",
        "min": 0,
        "max": 100,
    },
    {
        "key": "dirka_steal_min",
        "group": "dirka",
        "label": "Steal min",
        "type": "int",
        "min": 0,
        "max": 50,
    },
    {
        "key": "dirka_steal_max",
        "group": "dirka",
        "label": "Steal max",
        "type": "int",
        "min": 0,
        "max": 50,
    },
    {
        "key": "dirka_comeback_gap",
        "group": "dirka",
        "label": "Comeback razlika (točke)",
        "type": "int",
        "min": 1,
        "max": 200,
    },
    {
        "key": "dirka_comeback_mult",
        "group": "dirka",
        "label": "Comeback množitelj",
        "type": "float",
        "min": 1,
        "max": 3,
    },
    # MP
    {
        "key": "mp_correct_points",
        "group": "multiplayer",
        "label": "Točke za pravilen",
        "type": "int",
        "min": 1,
        "max": 1000,
    },
    {
        "key": "mp_round_bonus",
        "group": "multiplayer",
        "label": "Rundni bonus",
        "type": "int",
        "min": 0,
        "max": 500,
    },
    {
        "key": "mp_streak_bonus_2",
        "group": "multiplayer",
        "label": "Streak bonus (2×)",
        "type": "int",
        "min": 0,
        "max": 500,
    },
    {
        "key": "mp_streak_bonus_3",
        "group": "multiplayer",
        "label": "Streak bonus (3×+)",
        "type": "int",
        "min": 0,
        "max": 500,
    },
    {
        "key": "mp_catchup_bonus",
        "group": "multiplayer",
        "label": "Catch-up bonus",
        "type": "int",
        "min": 0,
        "max": 500,
    },
    {
        "key": "mp_max_players",
        "group": "multiplayer",
        "label": "Max igralcev",
        "type": "int",
        "min": 2,
        "max": 16,
    },
    {
        "key": "mp_max_bots",
        "group": "multiplayer",
        "label": "Max botov",
        "type": "int",
        "min": 0,
        "max": 15,
    },
    {
        "key": "mp_allowed_times",
        "group": "multiplayer",
        "label": "Dovoljeni časi (s)",
        "type": "int_list",
        "help": "Npr. 30, 60, 90, 120, 300",
    },
    {
        "key": "mp_question_counts",
        "group": "multiplayer",
        "label": "Dovoljena št. vprašanj",
        "type": "int_list",
        "help": "Npr. 5, 10, 20, 40, 50, 100",
    },
    {
        "key": "mp_round_advance_seconds",
        "group": "multiplayer",
        "label": "Samodejni prehod runde (s)",
        "type": "int",
        "min": 1,
        "max": 60,
    },
    # Hitra runda
    {
        "key": "hr_allowed_times",
        "group": "hitrarunda",
        "label": "Dovoljeni časi (s)",
        "type": "int_list",
        "help": "Npr. 10, 15, 20, 30, 45, 60",
    },
    {
        "key": "hr_max_speed_bonus",
        "group": "hitrarunda",
        "label": "Max speed bonus",
        "type": "int",
        "min": 0,
        "max": 500,
    },
    # Ala
    {
        "key": "ala_time_seconds",
        "group": "ala",
        "label": "Čas na vprašanje (s)",
        "type": "int",
        "min": 10,
        "max": 300,
    },
    {
        "key": "ala_safe_orders",
        "group": "ala",
        "label": "Varne točke (0-based indeks)",
        "type": "int_list",
        "help": "4 = 5. vprašanje, 9 = 10. vprašanje",
    },
    {
        "key": "ala_friends_pick",
        "group": "ala",
        "label": "Št. prijateljev za klic",
        "type": "int",
        "min": 1,
        "max": 5,
    },
    {
        "key": "ala_difficulty_targets",
        "group": "ala",
        "label": "Težavnostni vzorec (15)",
        "type": "int_list",
        "help": "Točno 15 vrednosti 1–5, npr. 1,1,1,2,2,2,3,3,3,4,4,4,5,5,5",
    },
    {
        "key": "ala_prize_ladder",
        "group": "ala",
        "label": "Nagradna lestvica",
        "type": "int_list",
        "help": "15 vrednosti, od najnižje do milijona",
    },
    # Sobe / gosti
    {
        "key": "room_idle_seconds",
        "group": "rooms",
        "label": "Idle timeout (s)",
        "type": "int",
        "min": 60,
        "max": 86400,
        "help": "Po toliko sekundah brez aktivnosti se soba zapre.",
    },
    {
        "key": "guest_cleanup_days",
        "group": "guests",
        "label": "Čiščenje gostov po (dneh)",
        "type": "int",
        "min": 1,
        "max": 365,
    },
    # Nicknames
    {
        "key": "nickname_adjectives",
        "group": "nicknames",
        "label": "Pridevniki",
        "type": "lines",
        "help": "En pridevnik na vrstico.",
    },
    {
        "key": "nickname_nouns",
        "group": "nicknames",
        "label": "Samostalniki",
        "type": "lines",
        "help": "En samostalnik na vrstico.",
    },
]

_FIELD_MAP = {item["key"]: item for item in FIELDS}


def _model():
    from game.models import SiteConfig

    return SiteConfig


def invalidate_cache():
    cache.delete(CACHE_KEY)


def get_all() -> dict:
    cached = cache.get(CACHE_KEY)
    if isinstance(cached, dict):
        # Novi defaulti se dodajo tudi nad starim cache.
        return {**deepcopy(DEFAULTS), **cached}
    merged = deepcopy(DEFAULTS)
    try:
        row = _model().load()
        stored = row.values if isinstance(row.values, dict) else {}
        for key in DEFAULTS:
            if key in stored:
                merged[key] = stored[key]
    except Exception:
        # Migracija še ni zagnana / test DB — uporabi default.
        pass
    cache.set(CACHE_KEY, merged, CACHE_TTL)
    return merged


def get(key: str):
    return get_all()[key]


def get_int_set(key: str) -> set[int]:
    return {int(x) for x in get(key)}


def get_skip_limits() -> set:
    raw = get("sixty_skip_limits")
    out = set()
    for item in raw:
        out.add(None if item is None else int(item))
    return out


def enabled_modes_set() -> set[str]:
    return {str(m).strip() for m in get("enabled_modes") if str(m).strip()}


def is_mode_enabled(mode: str) -> bool:
    return mode in enabled_modes_set()


def public_game_config() -> dict:
    data = get_all()
    skip = []
    for item in data["sixty_skip_limits"]:
        skip.append(None if item is None else int(item))
    return {
        "enabled_modes": list(data["enabled_modes"]),
        "hitrarunda": {
            "times": list(data["hr_allowed_times"]),
            "max_speed_bonus": int(data["hr_max_speed_bonus"]),
        },
        "ala_milijonar": {
            "time_limit_seconds": int(data["ala_time_seconds"]),
            "safe_orders": list(data["ala_safe_orders"]),
            "prize_ladder": list(data["ala_prize_ladder"]),
            "friends_pick": int(data["ala_friends_pick"]),
        },
        "multiplayer": {
            "times": list(data["mp_allowed_times"]),
            "question_counts": list(data["mp_question_counts"]),
            "max_players": int(data["mp_max_players"]),
            "max_bots": int(data["mp_max_bots"]),
            "round_advance_seconds": int(data["mp_round_advance_seconds"]),
        },
        "dirka": {
            "time_limit_seconds": int(data["dirka_time_seconds"]),
            "targets": list(data["dirka_target_scores"]),
            "safe_every": list(data["dirka_safe_every"]),
            "max_bots": int(data["mp_max_bots"]),
        },
        "sixty": {
            "start_seconds": int(data["sixty_start_seconds"]),
            "skip_limits": skip,
        },
        "guest_cleanup_days": int(data["guest_cleanup_days"]),
    }


def catalog_payload() -> dict:
    values = get_all()
    groups = []
    for group in GROUPS:
        fields = []
        for field in FIELDS:
            if field["group"] != group["id"]:
                continue
            entry = {k: field[k] for k in ("key", "label", "type", "help", "min", "max") if k in field}
            entry["value"] = values[field["key"]]
            entry["default"] = DEFAULTS[field["key"]]
            fields.append(entry)
        groups.append({**group, "fields": fields})
    return {"groups": groups, "values": values}


def _parse_int_list(raw) -> list[int]:
    if isinstance(raw, list):
        items = raw
    else:
        text = str(raw or "").replace(";", ",")
        items = [part.strip() for part in text.split(",") if part.strip()]
    out = []
    for item in items:
        out.append(int(item))
    if not out:
        raise ValueError("Seznam ne sme biti prazen.")
    return out


def _parse_int_list_null(raw) -> list:
    if isinstance(raw, list):
        items = raw
    else:
        text = str(raw or "").replace(";", ",")
        items = [part.strip() for part in text.split(",") if part.strip()]
    out = []
    for item in items:
        if item is None:
            out.append(None)
            continue
        token = str(item).strip().lower()
        if token in {"", "n", "none", "null", "neomejeno", "-"}:
            out.append(None)
        else:
            out.append(int(token))
    if not out:
        raise ValueError("Seznam ne sme biti prazen.")
    return out


def _parse_lines(raw) -> list[str]:
    if isinstance(raw, list):
        lines = [str(x).strip() for x in raw]
    else:
        lines = [line.strip() for line in str(raw or "").splitlines()]
    out = [line for line in lines if line]
    if not out:
        raise ValueError("Vsaj ena vrstica.")
    return out


def coerce_value(field: dict, raw):
    kind = field["type"]
    if kind == "int":
        value = int(raw)
        if "min" in field and value < field["min"]:
            raise ValueError(f"Min {field['min']}.")
        if "max" in field and value > field["max"]:
            raise ValueError(f"Max {field['max']}.")
        return value
    if kind == "float":
        value = float(raw)
        if "min" in field and value < field["min"]:
            raise ValueError(f"Min {field['min']}.")
        if "max" in field and value > field["max"]:
            raise ValueError(f"Max {field['max']}.")
        return value
    if kind == "int_list":
        return _parse_int_list(raw)
    if kind == "int_list_null":
        return _parse_int_list_null(raw)
    if kind == "lines":
        return _parse_lines(raw)
    if kind == "text":
        text = str(raw or "").strip()
        if not text:
            raise ValueError("Prazno.")
        return text
    raise ValueError("Neznan tip.")


def save_values(incoming: dict) -> dict:
    if not isinstance(incoming, dict):
        raise ValueError("Pričakovan objekt.")
    row = _model().load()
    stored = dict(row.values or {})
    errors = {}
    for key, raw in incoming.items():
        field = _FIELD_MAP.get(key)
        if field is None:
            errors[key] = "Neznano polje."
            continue
        try:
            stored[key] = coerce_value(field, raw)
        except (TypeError, ValueError) as exc:
            errors[key] = str(exc)
    if errors:
        raise ValueError(errors)
    # Extra checks (merge with defaults for partial updates)
    merged = {**DEFAULTS, **stored}
    modes = [str(m).strip() for m in merged["enabled_modes"] if str(m).strip()]
    bad = [m for m in modes if m not in KNOWN_MODES]
    if bad:
        raise ValueError({"enabled_modes": f"Neznani načini: {', '.join(bad)}"})
    if not modes:
        raise ValueError({"enabled_modes": "Vsaj en način mora biti vklopljen."})
    stored["enabled_modes"] = modes
    if len(merged.get("ala_prize_ladder") or []) != 15:
        raise ValueError({"ala_prize_ladder": "Lestvica mora imeti točno 15 vrednosti."})
    diffs = merged.get("ala_difficulty_targets") or []
    if len(diffs) != 15 or any(d not in {1, 2, 3, 4, 5} for d in diffs):
        raise ValueError({"ala_difficulty_targets": "Točno 15 vrednosti med 1 in 5."})
    if int(merged.get("mp_max_players") or 0) < 2:
        raise ValueError({"mp_max_players": "Vsaj 2 igralca."})
    if float(merged["bot_delay_max"]) < float(merged["bot_delay_min"]):
        raise ValueError({"bot_delay_max": "Max zakasnitev mora biti ≥ min."})
    if int(merged["dirka_steal_max"]) < int(merged["dirka_steal_min"]):
        raise ValueError({"dirka_steal_max": "Steal max mora biti ≥ min."})
    if int(merged["dirka_hot_streak_at"]) < int(merged["dirka_streak_at"]):
        raise ValueError({"dirka_hot_streak_at": "Hot streak mora biti ≥ navadni streak."})
    row.values = stored
    row.save(update_fields=["values", "updated_at"])
    invalidate_cache()
    return get_all()


def reset_to_defaults() -> dict:
    row = _model().load()
    row.values = {}
    row.save(update_fields=["values", "updated_at"])
    invalidate_cache()
    return get_all()
