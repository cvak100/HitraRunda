from game.bonus_models import BonusDefinition, PhoneFriend
from game.modes import MODE_ALA_MILIJONAR

DEFAULT_BONUSES = (
    {
        "key": "fifty_fifty",
        "name": "Polovička",
        "description": "Odstrani dve napačni možnosti. Velja za vprašanja z eno pravilno možnostjo.",
        "bonus_kind": BonusDefinition.Kind.LIFELINE,
        "effect_key": "fifty_fifty",
        "modes": [MODE_ALA_MILIJONAR],
        "config": {"max_uses": 1, "applies_to_types": ["multiple_choice"]},
        "order": 1,
    },
    {
        "key": "audience",
        "name": "Glas ljudstva",
        "description": "Pokaže, kako bi glasovala publika. Velja za vprašanja s štirimi možnostmi.",
        "bonus_kind": BonusDefinition.Kind.LIFELINE,
        "effect_key": "audience",
        "modes": [MODE_ALA_MILIJONAR],
        "config": {"max_uses": 1, "applies_to_types": ["multiple_choice"]},
        "order": 2,
    },
    {
        "key": "phone_friend",
        "name": "Klic v sili",
        "description": "Pokličeš enega od treh izbranih prijateljev. Njegov nasvet je odvisen od specialnosti.",
        "bonus_kind": BonusDefinition.Kind.LIFELINE,
        "effect_key": "phone_friend",
        "modes": [MODE_ALA_MILIJONAR],
        "config": {"max_uses": 1, "applies_to_types": ["multiple_choice"], "friends_pick": 3},
        "order": 3,
    },
)

DEFAULT_FRIENDS = (
    {
        "key": "mira",
        "name": "Mira",
        "title": "Trači, TV in mediji",
        "bio": "Vse ve o zvezdnikih in oddajah. Pri športu in zemljevidih hitro zgubi kompas.",
        "specialty_categories": [],
        "reliability": 0.55,
        "out_of_specialty_reliability": 0.55,
        "avatar_color": "#d46b8c",
        "order": 1,
    },
    {
        "key": "urban",
        "name": "Urban",
        "title": "Univerzalec",
        "bio": "Malo od vsega. Redko zgreši povsem, redko pa je tudi 100 % prepričan.",
        "specialty_categories": [],
        "reliability": 0.68,
        "out_of_specialty_reliability": 0.68,
        "avatar_color": "#6b8fd4",
        "order": 2,
    },
    {
        "key": "rok",
        "name": "Rok",
        "title": "Športni navdušenec",
        "bio": "Rezultati, rekviziti, rekoridi. Če ni žoga ali tekma, ugiba.",
        "specialty_categories": ["sport"],
        "reliability": 0.9,
        "out_of_specialty_reliability": 0.28,
        "avatar_color": "#3d9b5f",
        "order": 3,
    },
    {
        "key": "zala",
        "name": "Zala",
        "title": "Zgodovina",
        "bio": "Datumi, vladarji, dogodki. Zemljepis ji gre srednje, šport skoraj nič.",
        "specialty_categories": ["zemljepis"],
        "reliability": 0.82,
        "out_of_specialty_reliability": 0.3,
        "avatar_color": "#b8860b",
        "order": 4,
    },
    {
        "key": "gregor",
        "name": "Gregor",
        "title": "Zemljepis",
        "bio": "Glavna mesta, reke, meje. Na športnih quizih je tiho.",
        "specialty_categories": ["zemljepis"],
        "reliability": 0.92,
        "out_of_specialty_reliability": 0.25,
        "avatar_color": "#2a7f9e",
        "order": 5,
    },
    {
        "key": "teja",
        "name": "Teja",
        "title": "Splošna razgledanost",
        "bio": "Bralka in radovednežinja. Najboljša pri mešanih vprašanjih, šibkejša pri čistem športu.",
        "specialty_categories": ["zemljepis"],
        "reliability": 0.72,
        "out_of_specialty_reliability": 0.42,
        "avatar_color": "#8e6bbf",
        "order": 6,
    },
)


def ensure_bonuses_and_friends():
    for item in DEFAULT_BONUSES:
        BonusDefinition.objects.update_or_create(
            key=item["key"],
            defaults={
                "name": item["name"],
                "description": item["description"],
                "bonus_kind": item["bonus_kind"],
                "effect_key": item["effect_key"],
                "modes": item["modes"],
                "config": item["config"],
                "is_active": True,
                "order": item["order"],
            },
        )
    for item in DEFAULT_FRIENDS:
        PhoneFriend.objects.update_or_create(
            key=item["key"],
            defaults={
                "name": item["name"],
                "title": item["title"],
                "bio": item["bio"],
                "specialty_categories": item["specialty_categories"],
                "reliability": item["reliability"],
                "out_of_specialty_reliability": item["out_of_specialty_reliability"],
                "avatar_color": item["avatar_color"],
                "is_active": True,
                "order": item["order"],
            },
        )
