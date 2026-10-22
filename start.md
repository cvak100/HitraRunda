# Multiplayer Quiz Game — Developer Start Guide

## Introduction

Real-time multiplayer quiz game built with **Python + Django + Django Channels (WebSockets)**.

The game is not a classic quiz. It is a fast, competitive, and dynamic game where:

- Players compete in short rounds
- Different question types exist based on difficulty
- A bonus system (main + round bonuses) allows the result to still be turned around (multiplayer version)
- All interactions are click, drag, and slider based (no typing of answers)
- Players have immediate visibility of the leaderboard and bonus mechanics (multiplayer)

**Two versions planned:**

1. **Millionaire-style (solo)** — first implementation target
2. **Full multiplayer** — built later by extending the same structure

**Goal:** Maximize code and model reuse. Build the full framework now, but only make the Millionaire solo mode fully functional first. Multiplayer should be addable later by copying/extending existing pieces.

Supports 2 players (1v1) and playing against the computer (later). Sudden death is an optional setting (later).

---

## 1. Tech Stack

- Django 5.x
- Django Channels + Redis
- Django REST Framework
- PostgreSQL
- Custom User model (`AbstractUser`)

---

## 2. Identity and Registration

### Rules

- **Registered user**
  - Registers with email and password
  - Has a default `nickname`
  - Can have statistics, game history, and saved results

- **Guest**
  - No registration
  - Receives a temporary nickname
  - Has no saved history or statistics
  - Exists only for the current session

- **Nickname**
  - Must be **unique within a room**
  - The system does **not** automatically append numbers or other characters
  - If a nickname is taken, the player must choose another one
  - A **Generate random nickname** option is available

- The default nickname of a registered user is only suggested when joining a room. It can be changed in the room.

### User Model

```python
class User(AbstractUser):
    email = models.EmailField(unique=True, null=True, blank=True)
    nickname = models.CharField(max_length=30, blank=True)

    avatar = models.URLField(blank=True, null=True)
    preferred_color = models.CharField(max_length=20, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(null=True, blank=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []
```

### Notes

- A user with an `email` is a registered user.
- A user without an `email` is a guest.
- The `nickname` field on `User` is only a default suggestion.
- The actual nickname used in a game is stored in `RoomMember.nickname_in_room` and must be unique within that room.

---

## 3. Room and RoomMember

### Rules

- A room is created by a host.
- Rooms have a visibility setting:
  - `public` — visible in the room list, anyone can join
  - `private` — accessible only via link + password
  - `unlisted` — accessible only via link (no password, not listed)
- Each room has a short unique code used in shareable links.
- Players can join via link or by invitation (username search) — *later for multiplayer*.
- While the room is in `waiting` status, players can join and the host can configure game settings.
- Game settings are stored as a flexible JSON object so they can be configured per room.
- Room status progresses through `waiting` → `playing` → `finished`.
- Supports 2 players by default, with the possibility of playing against the computer.
- Sudden death is an optional setting that the host can enable (later).

### Room Model

```python
class Room(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=8, unique=True)

    name = models.CharField(max_length=100, blank=True)

    host = models.ForeignKey(
        'User',
        on_delete=models.CASCADE,
        related_name='hosted_rooms'
    )

    visibility = models.CharField(
        max_length=10,
        choices=[
            ('public', 'Public'),
            ('private', 'Private'),
            ('unlisted', 'Unlisted'),
        ],
        default='public'
    )
    password = models.CharField(max_length=128, null=True, blank=True)

    status = models.CharField(
        max_length=10,
        choices=[
            ('waiting', 'Waiting'),
            ('playing', 'Playing'),
            ('finished', 'Finished'),
        ],
        default='waiting'
    )

    settings = models.JSONField(default=dict)

    max_players = models.PositiveSmallIntegerField(default=2)

    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
```

### RoomMember Model

```python
class RoomMember(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='members')
    user = models.ForeignKey('User', on_delete=models.CASCADE, related_name='room_memberships')

    nickname_in_room = models.CharField(max_length=30)
    color = models.CharField(max_length=20, blank=True)

    is_host = models.BooleanField(default=False)
    is_ready = models.BooleanField(default=False)
    is_connected = models.BooleanField(default=False)

    joined_at = models.DateTimeField(auto_now_add=True)
    left_at = models.DateTimeField(null=True, blank=True)
    last_activity = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['room', 'nickname_in_room']
```

### Notes

- `nickname_in_room` must be unique within the room.
- `is_connected` reflects the current WebSocket presence of the player.
- A user can be a member of multiple rooms over time.
- The host is also represented as a `RoomMember` with `is_host=True`.

### Room.settings example (Millionaire)

```json
{
  "mode": "millionaire",
  "question_count": 10,
  "categories": ["sport", "zemljepis"],
  "time_limit_seconds": 20,
  "difficulty_progression": "increasing"
}
```

---

## 4. Questions

### Category

```python
class Category(models.Model):
    name = models.CharField(max_length=50, unique=True)
    slug = models.SlugField(unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "name"]
```

**Initial categories:** Šport (`sport`), Zemljepis (`zemljepis`).

### Question

```python
class Question(models.Model):
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name="questions")
    text = models.TextField()
    difficulty = models.PositiveSmallIntegerField(db_index=True)  # 1–5 or 1–10
    question_type = models.CharField(
        max_length=30,
        choices=[
            ("multiple_choice", "Multiple Choice"),
            ("true_false", "True / False"),
            ("multi_select", "Multi Select"),
            ("ordering", "Ordering"),
            ("matching", "Matching"),
            ("slider", "Slider"),
        ],
        db_index=True,
    )
    config = models.JSONField(default=dict, blank=True)  # type-specific settings
    explanation = models.TextField(blank=True)
    image = models.URLField(blank=True, null=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["category", "difficulty", "is_active"]),
        ]
```

### QuestionOption

```python
class QuestionOption(models.Model):
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="options")
    text = models.CharField(max_length=500)
    is_correct = models.BooleanField(default=False)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        unique_together = [("question", "order")]
        ordering = ["order"]
```

### Supported Question Types

- **multiple_choice** — standard 4 options, one correct
- **true_false**
- **multi_select** — select all correct
- **ordering** — drag to reorder
- **matching** — connect pairs
- **slider** — estimate a numeric value

Use `config` JSON for type-specific data (correct order, pairs, slider min/max/tolerance, etc.).

---

## 5. Game Session Models

### GameSession

```python
class GameSession(models.Model):
    room = models.OneToOneField("Room", on_delete=models.CASCADE, related_name="game_session")
    mode = models.CharField(
        max_length=20,
        choices=[("millionaire", "Millionaire"), ("multiplayer", "Multiplayer")],
    )
    status = models.CharField(
        max_length=20,
        default="preparing",
        choices=[
            ("preparing", "Preparing"),
            ("active", "Active"),
            ("finished", "Finished"),
            ("aborted", "Aborted"),
        ],
    )
    total_questions = models.PositiveSmallIntegerField()
    current_question_index = models.PositiveSmallIntegerField(default=0)
    time_limit_seconds = models.PositiveSmallIntegerField()
    state = models.JSONField(default=dict)  # mode-specific (prize, scores, bonuses...)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
```

### GameQuestion

```python
class GameQuestion(models.Model):
    game_session = models.ForeignKey(GameSession, on_delete=models.CASCADE, related_name="game_questions")
    question = models.ForeignKey(Question, on_delete=models.CASCADE)
    order = models.PositiveSmallIntegerField()
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = [("game_session", "order")]
        ordering = ["order"]
```

### PlayerAnswer

```python
class PlayerAnswer(models.Model):
    game_question = models.ForeignKey(GameQuestion, on_delete=models.CASCADE, related_name="answers")
    room_member = models.ForeignKey("RoomMember", on_delete=models.CASCADE, related_name="answers")
    selected_option = models.ForeignKey(QuestionOption, on_delete=models.SET_NULL, null=True, blank=True)
    answer_data = models.JSONField(default=dict, blank=True)  # for ordering, matching, slider, multi
    is_correct = models.BooleanField(null=True)
    answered_at = models.DateTimeField(null=True, blank=True)
    time_taken_ms = models.PositiveIntegerField(null=True, blank=True)
    points = models.IntegerField(default=0)

    class Meta:
        unique_together = [("game_question", "room_member")]
```

---

## 6. Millionaire Solo Flow (First Implementation Target)

1. User (registered or guest) creates a Room and becomes the host (`RoomMember` with `is_host=True`).
2. Instead of inviting, chooses game mode = `millionaire`.
3. Configures settings: dynamic question count (min 5), categories (Sport + Geography for now), time limit.
4. Start game:
   - Create `GameSession`
   - Select questions from chosen categories
   - Create ordered `GameQuestion` records
   - Room status → `playing`
5. Play questions one by one (via WebSocket):
   - Show question + timer
   - Player submits answer (click/drag/slider)
   - Server validates, stores `PlayerAnswer`, returns result
   - Advance to next question or finish
6. End:
   - Show final result / prize
   - Save result for registered users
   - Room status → `finished`

**No bonuses** in this version.  
**No ready check** required (solo).  
**No invites**.

### Question Selection

- Filter by selected categories + `is_active=True`
- Select `question_count` questions
- Prefer increasing difficulty if `difficulty_progression: "increasing"`
- No repeats within a session

### Scoring (Millionaire)

Simple for now:
- Correct answer → points or prize step
- Optional speed bonus
- Store current progress in `GameSession.state` (e.g. current_prize, correct_count)

---

## 7. WebSocket Events (implement for solo, ready for multiplayer)

**Client → Server**
- `start_game`
- `submit_answer`

**Server → Client**
- `game_started`
- `question`
- `answer_result`
- `game_finished`
- `error`

Use Django Channels consumers. Room group by `room.code`.

---

## 8. What to Implement Now vs Later

### Implement now (Millionaire solo)
- All models above
- Room creation with mode selection
- Question selection + GameSession setup
- Solo play flow over WebSockets
- Basic scoring
- Django admin for Categories + Questions + Options
- Guest support

### Leave for later (multiplayer)
- Invites / joining other players
- Multiple `RoomMember`s
- Ready check (`is_ready`)
- Bonuses (main + round)
- Leaderboard between rounds
- Sudden death
- vs Computer AI
- Full competitive scoring

---

## 9. Additional Notes

- All player interactions are click, drag, or slider based. No free-text answers.
- Time limit is per question and set in `Room.settings`.
- Nickname uniqueness is enforced per room only.
- Maximize reuse: the same models and WebSocket structure should support multiplayer with minimal changes.

---

**This document contains the full design agreed so far.**  
Build the complete framework, but make only the Millionaire solo mode fully functional first.