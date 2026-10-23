import random

from game.site_settings import get as site_get


class NicknameError(Exception):
    def __init__(self, message):
        self.message = message
        super().__init__(message)


# Moški pridevniki — samo z moškimi samostalniki.
_ADJECTIVES_MASCULINE = [
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
]

# Ženski pridevniki — samo z ženskimi samostalniki.
_ADJECTIVES_FEMININE = [
    "Hitra",
    "Tiha",
    "Zlata",
    "Modra",
    "Vesela",
    "Pogumna",
    "Spretna",
    "Mirna",
    "Jasna",
    "Topla",
    "Hladna",
    "Zvesta",
    "Lahka",
    "Ostra",
    "Krasna",
    "Prava",
]

# Moški samostalniki (= tudi ključi risanih avatarjev).
_NOUNS_MASCULINE = [
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
]

# Ženski samostalniki (= tudi ključi risanih avatarjev, nadaljevanje seznama).
_NOUNS_FEMININE = [
    "Vitezinja",
    "Princesa",
    "Čarovnica",
    "Kraljica",
    "Amazonka",
    "Indijanka",
    "Pehta",
]

# Vsi avatarji (moški + ženski) — isti vrstni red kot frontend `AVATARS`.
_AVATAR_NOUNS = tuple(_NOUNS_MASCULINE) + tuple(_NOUNS_FEMININE)

_SLUG_MAP = str.maketrans(
    {
        "č": "c",
        "š": "s",
        "ž": "z",
        "ć": "c",
        "đ": "d",
        "Č": "c",
        "Š": "s",
        "Ž": "z",
        "Ć": "c",
        "Đ": "d",
    }
)


def noun_to_avatar_key(noun: str) -> str:
    return str(noun or "").strip().translate(_SLUG_MAP).lower()


# Risani profili — ključ = slug samostalnika (obstaja JPG v /avatars/).
AVATAR_PROFILES = tuple(
    {"key": noun_to_avatar_key(noun), "label": noun} for noun in _AVATAR_NOUNS
)
AVATAR_KEYS = {item["key"] for item in AVATAR_PROFILES}
_AVATAR_KEY_LIST = tuple(item["key"] for item in AVATAR_PROFILES)

# Usklajeno s frontend `AVATAR_COLORS` (rob avatarja).
AVATAR_COLORS = (
    "#7dcea0",
    "#e07a68",
    "#f5b041",
    "#85c1e9",
    "#bb8fce",
    "#e74c3c",
    "#e59866",
)

# Zastarelo: en skupni seznam (samo za uvoz/kompatibilnost).
_ADJECTIVES_FALLBACK = _ADJECTIVES_MASCULINE
_NOUNS_FALLBACK = list(_AVATAR_NOUNS)


def resolve_avatar_key(avatar="", nickname="", seed=""):
    """Vrne veljaven ključ avatarja: shranjen, iz vzdevka, ali stabilen fallback."""
    key = str(avatar or "").strip().lower()
    if key in AVATAR_KEYS:
        return key
    parts = str(nickname or "").split()
    if parts:
        from_nick = noun_to_avatar_key(parts[-1])
        if from_nick in AVATAR_KEYS:
            return from_nick
    if _AVATAR_KEY_LIST:
        raw = str(seed or nickname or "ris")
        return _AVATAR_KEY_LIST[sum(ord(c) for c in raw) % len(_AVATAR_KEY_LIST)]
    return "ris"


def random_avatar_color(seed=""):
    raw = str(seed or uuid_seed())
    return AVATAR_COLORS[sum(ord(c) for c in raw) % len(AVATAR_COLORS)]


def uuid_seed():
    return str(random.getrandbits(64))


def avatar_for_member(member):
    bot = getattr(member, "bot_profile", None)
    if getattr(member, "is_bot", False) and bot is not None:
        bot_avatar = getattr(bot, "avatar", "") or ""
        if bot_avatar in AVATAR_KEYS:
            return bot_avatar
    user = getattr(member, "user", None)
    user_avatar = getattr(user, "avatar", "") if user is not None else ""
    return resolve_avatar_key(
        avatar=user_avatar,
        nickname=getattr(member, "nickname_in_room", "") or "",
        seed=str(getattr(member, "id", "") or ""),
    )


def _site_words(*keys):
    """Prvi neprazen seznam iz site_settings (podpira tudi stare ključe)."""
    for key in keys:
        try:
            words = [str(w).strip() for w in (site_get(key) or []) if str(w).strip()]
            if words:
                return words
        except Exception:
            continue
    return []


def _adjectives_masculine():
    return _site_words("nickname_adjectives_masculine", "nickname_adjectives") or list(
        _ADJECTIVES_MASCULINE
    )


def _adjectives_feminine():
    return _site_words("nickname_adjectives_feminine") or list(_ADJECTIVES_FEMININE)


def _nouns_masculine():
    return _site_words("nickname_nouns_masculine", "nickname_nouns") or list(_NOUNS_MASCULINE)


def _nouns_feminine():
    return _site_words("nickname_nouns_feminine") or list(_NOUNS_FEMININE)


def clean_nickname(value):
    nickname = " ".join(str(value or "").split())
    if not 2 <= len(nickname) <= 30:
        raise NicknameError("Vzdevek mora imeti od 2 do 30 znakov.")
    return nickname


def random_nickname():
    """Naključni vzdevek: pridevnik + samostalnik istega spola (nikoli mešano)."""
    if random.random() < 0.5:
        return f"{random.choice(_adjectives_masculine())} {random.choice(_nouns_masculine())}"
    return f"{random.choice(_adjectives_feminine())} {random.choice(_nouns_feminine())}"
