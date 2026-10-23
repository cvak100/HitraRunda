MODE_HITRARUNDA = "hitrarunda"
MODE_ALA_MILIJONAR = "ala_milijonar"
MODE_MULTIPLAYER = "multiplayer"

MODE_CHOICES = [
    (MODE_HITRARUNDA, "Hitra runda"),
    (MODE_ALA_MILIJONAR, "Ala milijonar"),
    (MODE_MULTIPLAYER, "Več igralcev"),
]

PLAYABLE_MODES = {MODE_HITRARUNDA, MODE_ALA_MILIJONAR, MODE_MULTIPLAYER}
SOLO_MODES = {MODE_HITRARUNDA, MODE_ALA_MILIJONAR}

# Multiplayer: točke za pravilen odgovor + hitrost, rundni bonus za najhitrejšega pravilnega.
MP_CORRECT_POINTS = 100
MP_ROUND_BONUS = 50
MP_STREAK_BONUS_2 = 25
MP_STREAK_BONUS_3 = 50
MP_CATCHUP_BONUS = 40
MP_MIN_PLAYERS = 2
MP_MAX_PLAYERS = 6
MP_MAX_BOTS = 3
# AI: verjetnost pravilnega odgovora in zakasnitev v sekundah.
MP_BOT_ACCURACY = 0.72
MP_BOT_DELAY_MIN = 1.2
MP_BOT_DELAY_MAX = 7.5
# Po rundi: samodejni prehod na naslednje vprašanje.
MP_ROUND_ADVANCE_SECONDS = 5
BOT_NICKNAMES = ("Bot Marko", "Bot Lea", "Bot Niko")

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
