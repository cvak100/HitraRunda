MODE_HITRARUNDA = "hitrarunda"
MODE_ALA_MILIJONAR = "ala_milijonar"
MODE_MULTIPLAYER = "multiplayer"
MODE_DIRKA = "dirka"
MODE_60_SEKUND = "60_sekund"
MODE_ZASTAVE = "zastave"

MODE_CHOICES = [
    (MODE_HITRARUNDA, "Hitra runda"),
    (MODE_ALA_MILIJONAR, "Ala milijonar"),
    (MODE_MULTIPLAYER, "Hitra tekma"),
    (MODE_DIRKA, "Dirka"),
    (MODE_60_SEKUND, "60 sekund"),
    (MODE_ZASTAVE, "Ugib zastav"),
]

PLAYABLE_MODES = {
    MODE_HITRARUNDA,
    MODE_ALA_MILIJONAR,
    MODE_MULTIPLAYER,
    MODE_DIRKA,
    MODE_60_SEKUND,
    MODE_ZASTAVE,
}
SOLO_MODES = {MODE_HITRARUNDA, MODE_ALA_MILIJONAR, MODE_60_SEKUND, MODE_ZASTAVE}
LOBBY_MODES = {MODE_MULTIPLAYER, MODE_DIRKA}

ZASTAVE_TIME_SECONDS = 15
ZASTAVE_ALLOWED_TIMES = {10, 15, 20, 30, 60}
ZASTAVE_CORRECT_POINTS = 100
ZASTAVE_CONTINENTS = {
    "africa",
    "antarctica",
    "asia",
    "europe",
    "north_america",
    "south_america",
    "oceania",
}
ZASTAVE_KINDS = ("flag_to_name", "name_to_flag")

# 60 sekund: skupni clock, +2/−5/−2, samo MC/TF.
SIXTY_START_SECONDS = 60
SIXTY_CLOCK_CAP = 180
SIXTY_CORRECT_BONUS = 2
SIXTY_WRONG_PENALTY = 5
SIXTY_SKIP_PENALTY = 2
SIXTY_SKIP_LIMITS = {None, 3, 5, 10}  # None = neomejeno
SIXTY_QUESTION_TYPES = ("multiple_choice", "true_false")
SIXTY_DIFFICULTY_PROFILES = ("mild", "normal", "sharp")
# (max_elapsed_s inclusive, min_diff, max_diff) — po preživetem času.
SIXTY_DIFFICULTY_BANDS = {
    "mild": (
        (45, 1, 2),
        (90, 2, 3),
        (135, 3, 4),
        (180, 4, 5),
        (10_000, 5, 5),
    ),
    "normal": (
        (30, 1, 2),
        (60, 2, 3),
        (90, 3, 4),
        (120, 4, 5),
        (10_000, 5, 5),
    ),
    "sharp": (
        (20, 1, 3),
        (40, 2, 4),
        (60, 3, 5),
        (90, 4, 5),
        (10_000, 5, 5),
    ),
}

# Multiplayer: točke za pravilen odgovor + hitrost, rundni bonus za najhitrejšega pravilnega.
MP_CORRECT_POINTS = 100
MP_ROUND_BONUS = 50
MP_STREAK_BONUS_2 = 25
MP_STREAK_BONUS_3 = 50
MP_CATCHUP_BONUS = 40
MP_MIN_PLAYERS = 2
MP_MAX_PLAYERS = 6
MP_MAX_BOTS = 5
# AI: privzete vrednosti, če bot nima profila.
MP_BOT_ACCURACY = 0.72
MP_BOT_DELAY_MIN = 1.2
MP_BOT_DELAY_MAX = 7.5
# Po rundi: samodejni prehod na naslednje vprašanje.
MP_ROUND_ADVANCE_SECONDS = 5
# Čas na vprašanje / število vprašanj v večigralski sobi.
MP_ALLOWED_TIMES = {30, 60, 90, 120, 300}
MP_QUESTION_COUNTS = {5, 10, 20, 40, 50, 100}
# Soba se zapre, če ni aktivnosti.
ROOM_IDLE_SECONDS = 60 * 60

# Dirka: sinhrona dirka do ciljnih točk.
DIRKA_TARGET_SCORES = {100, 200, 500, 1000}
DIRKA_SAFE_EVERY = {5, 10}
DIRKA_TIME_SECONDS = 30
# Točke ~10× manjše od prve verzije (dirka do 100/200/… ima smisel).
DIRKA_BASE_POINTS = 5
DIRKA_MAX_SPEED_BONUS = 2
DIRKA_PENALTY = 4
DIRKA_STEAL_MIN = 2
DIRKA_STEAL_MAX = 4
DIRKA_STREAK_AT = 3
DIRKA_STREAK_BONUS = 5
DIRKA_HOT_STREAK_AT = 5
DIRKA_HOT_STREAK_BONUS = 10
DIRKA_COMEBACK_GAP = 15
DIRKA_COMEBACK_MULT = 1.3
DIRKA_SAFE_REWARD = 2
DIRKA_CLEAN_SHEET = 3
DIRKA_QUESTION_POOL = 80
DIRKA_EXTRA_TIME = 30
DIRKA_RUSH_CAP = 15
DIRKA_ROUND_ADVANCE_SECONDS = 5
DIRKA_BOT_KEY = "dirka"
DIRKA_MAX_BONUS_TYPES = 5
DIRKA_ACTIVE_BONUSES = (
    "fifty_fifty",
    "hint",
    "extra_time",
    "second_chance",
    "skip",
    "shield",
    "steal",
    "rush",
    "double",
    "block",
)
DIRKA_SHIELD_ROUNDS = 3
# 3 iste + 4. isti → pretvori v 1 naključni močan (stack se zbriše).
DIRKA_CONVERT_STACK = 4
# Preboj: prvič ≥ ta delež cilja → močan (1× na dirko).
DIRKA_BREAKTHROUGH_RATIO = 0.5
DIRKA_WEAK_BONUSES = ("hint", "extra_time", "shield", "skip")
# Močnejši dropi: clean safe, preboj, solo sprint, convert…
DIRKA_STRONG_BONUSES = (
    "fifty_fifty",
    "steal",
    "double",
    "second_chance",
    "rush",
    "block",
)

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
