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
    "Ščuka",
    "Rak",
    "Lev",
    "Tiger",
    "Smuk",
    "Kapetan",
    "Jastreb",
    "Sova",
    "Lisica",
    "Veverica",
    "Zajec",
    "Srna",
    "Prašič",
    "Riba",
    "Morski pes",
    "Kit",
    "Delfin",
    "Oktopod",
    "Kameleon",
    "Kača",
    "Žaba",
    "Metulj",
    "Čebela",
    "Mravlja",
    "Pajek",
    "Orel",
    "Sokol",
    "Krokar",
    "Golob",
    "Labod",
    "Pingvin",
    "Kenguru",
    "Slon",
    "Nosorog",
    "Žirafa",
    "Hipopotam",
    "Krokodil",
    "Jaguar",
    "Panter",
    "Gepard",
    "Vitez",
    "Kralj",
    "Knez",
    "Stražar",
    "Lovc",
    "Ribič",
    "Pionir",
    "Raziskovalec",
    "Navigator",
    "Pilot",
    "Kapetan",
    "Admiral",
    "General",
    "Junak",
    "Zmaj",
    "Feniks",
    "Samorog",
    "Minotaver",
]


def clean_nickname(value):
    nickname = " ".join(str(value or "").split())
    if not 2 <= len(nickname) <= 30:
        raise NicknameError("Vzdevek mora imeti od 2 do 30 znakov.")
    return nickname


def random_nickname():
    return f"{random.choice(ADJECTIVES)} {random.choice(NOUNS)}"
