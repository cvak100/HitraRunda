MODE_HITRARUNDA = "hitrarunda"
MODE_ALA_MILIJONAR = "ala_milijonar"

MODE_CHOICES = [
    (MODE_HITRARUNDA, "Hitra runda"),
    (MODE_ALA_MILIJONAR, "Ala milijonar"),
    ("multiplayer", "Več igralcev"),
]

PLAYABLE_MODES = {MODE_HITRARUNDA, MODE_ALA_MILIJONAR}

MODE_LABELS = dict(MODE_CHOICES)

ALA_QUESTION_COUNT = 15
FRIENDS_PICK = 3

# Ala milijonar: samo multiple_choice s točno 4 možnostmi (brez drži/ne drži, parov, drsnika…).
ALA_QUESTION_TYPES = ("multiple_choice",)
ALA_OPTION_COUNT = 4
# 0-based indeksi vprašanj, ki so varne točke (5. in 10. vprašanje).
ALA_SAFE_ORDERS = (4, 9)
# 15 vprašanj: po 3 iz vsake težavnosti 1→5.
ALA_DIFFICULTY_TARGETS = (1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5)
