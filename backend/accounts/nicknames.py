import random

class NicknameError(Exception):
    def __init__(self, message):
        self.message = message
        super().__init__(message)


ADJECTIVES = [
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

NOUNS = [
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


def clean_nickname(value):
    nickname = " ".join(str(value or "").split())
    if not 2 <= len(nickname) <= 30:
        raise NicknameError("Vzdevek mora imeti od 2 do 30 znakov.")
    return nickname


def random_nickname():
    return f"{random.choice(ADJECTIVES)} {random.choice(NOUNS)}"
