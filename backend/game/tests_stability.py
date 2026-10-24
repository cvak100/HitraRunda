"""Stabilnost: timeouti, reconnect lobby, host offline, stale rooms."""

from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from game.consumers import GameConsumer
from game.dirka import apply_dirka_timeout, next_dirka, start_dirka, submit_dirka
from game.engine import GameError, require_can_advance, set_member_connected, submit_answer
from game.modes import MODE_60_SEKUND, MODE_MULTIPLAYER
from game.models import GameSession, PlayerAnswer
from game.multiplayer import start_multiplayer
from game.seed_content import ensure_bonuses_and_friends
from game.sixty import apply_sixty_timeout, start_sixty
from questions.models import Category, Question, QuestionOption
from rooms.models import Room, RoomMember
from rooms.services import close_live_rooms, close_stale_rooms


def make_mc(category, key, difficulty=1):
    question = Question.objects.create(
        external_key=key,
        category=category,
        question_type=Question.Type.MULTIPLE_CHOICE,
        difficulty=difficulty,
        text=f"Q {key}",
        is_active=True,
    )
    QuestionOption.objects.create(question=question, text="A", is_correct=True, order=0)
    QuestionOption.objects.create(question=question, text="B", is_correct=False, order=1)
    QuestionOption.objects.create(question=question, text="C", is_correct=False, order=2)
    QuestionOption.objects.create(question=question, text="D", is_correct=False, order=3)
    return question


class SixtyTimeoutGuardTests(TestCase):
    def setUp(self):
        self.category = Category.objects.create(slug="stab-60", name="Stab60", is_active=True)
        for index in range(15):
            make_mc(self.category, f"stab60-{index}", difficulty=1 + (index % 5))
        self.client = APIClient()
        self.client.post("/api/auth/guest/", {"nickname": "StabUra"}, format="json")

    def _start(self):
        created = self.client.post(
            "/api/rooms/",
            {
                "mode": MODE_60_SEKUND,
                "nickname": "StabUra",
                "categories": ["stab-60"],
                "skip_limit": None,
                "difficulty_profile": "normal",
            },
            format="json",
        )
        self.assertEqual(created.status_code, 200, created.data)
        member = RoomMember.objects.get(room__code=created.data["code"], is_host=True)
        first = start_sixty(member.id)[0]
        return member, first

    def test_early_client_timeout_rejected(self):
        member, first = self._start()
        session = GameSession.objects.get(room__code=member.room.code)
        self.assertEqual(session.status, "active")
        with self.assertRaises(GameError):
            submit_answer(
                member.id,
                {"game_question_id": first["question"]["game_question_id"], "timeout": True},
            )
        session.refresh_from_db()
        self.assertEqual(session.status, "active")

    def test_apply_sixty_timeout_only_when_clock_expired(self):
        member, first = self._start()
        gq = first["question"]["game_question_id"]
        self.assertEqual(apply_sixty_timeout(member.id, gq), [])
        session = GameSession.objects.get(room__code=member.room.code)
        state = dict(session.state or {})
        state["clock_ends_at"] = (timezone.now() - timedelta(seconds=1)).isoformat()
        session.state = state
        session.save(update_fields=["state"])
        out = apply_sixty_timeout(member.id, gq)
        self.assertEqual(out[0]["phase"], "finished")


class DirkaTimeoutStabilityTests(TestCase):
    def setUp(self):
        ensure_bonuses_and_friends()
        self.category = Category.objects.create(slug="stab-dirka", name="StabDirka", is_active=True)
        for index in range(12):
            make_mc(self.category, f"stab-d-{index}")
        self.host = APIClient()
        self.guest = APIClient()
        self.host.post("/api/auth/guest/", {"nickname": "HStab"}, format="json")
        self.guest.post("/api/auth/guest/", {"nickname": "GStab"}, format="json")

    def _start(self):
        created = self.host.post(
            "/api/rooms/",
            {
                "mode": "dirka",
                "nickname": "HStab",
                "visibility": "public",
                "max_players": 4,
                "target_score": 500,
                "safe_every": 5,
                "categories": ["stab-dirka"],
                "bot_count": 0,
            },
            format="json",
        )
        code = created.data["code"]
        self.guest.post(f"/api/rooms/{code}/join/", {"nickname": "GStab"}, format="json")
        self.host.post(f"/api/rooms/{code}/ready/", {"ready": True}, format="json")
        self.guest.post(f"/api/rooms/{code}/ready/", {"ready": True}, format="json")
        host = RoomMember.objects.get(room__code=code, is_host=True, is_bot=False)
        guest = RoomMember.objects.exclude(pk=host.pk).get(room__code=code, is_bot=False)
        start_dirka(host.id)
        return host, guest

    def test_staggered_personal_timeouts(self):
        host, guest = self._start()
        session = GameSession.objects.get(room=host.room)
        gq = session.game_questions.get(order=0)
        state = dict(session.state or {})
        deadlines = dict(state.get("deadlines") or {})
        past = (timezone.now() - timedelta(seconds=2)).isoformat()
        future = (timezone.now() + timedelta(seconds=30)).isoformat()
        deadlines[str(host.id)] = past
        deadlines[str(guest.id)] = future
        state["deadlines"] = deadlines
        session.state = state
        session.save(update_fields=["state"])

        first = apply_dirka_timeout(host.id, str(gq.id))
        self.assertTrue(first)
        self.assertEqual(first[0]["phase"], "answer_progress")
        self.assertTrue(PlayerAnswer.objects.filter(game_question=gq, room_member=host).exists())
        self.assertFalse(PlayerAnswer.objects.filter(game_question=gq, room_member=guest).exists())

        deadlines[str(guest.id)] = (timezone.now() - timedelta(seconds=1)).isoformat()
        state = dict(session.state or {})
        state["deadlines"] = deadlines
        session.state = state
        session.save(update_fields=["state"])
        second = apply_dirka_timeout(guest.id, str(gq.id))
        self.assertEqual(second[0]["phase"], "round_review")
        self.assertTrue(PlayerAnswer.objects.filter(game_question=gq, room_member=guest).exists())

    def test_early_client_timeout_does_not_store_timeout_answer(self):
        host, _guest = self._start()
        session = GameSession.objects.get(room=host.room)
        gq = session.game_questions.get(order=0)
        correct = gq.question.options.get(is_correct=True)
        # Zgodnji timeout ne sme shraniti timeout odgovora.
        try:
            submit_dirka(host.id, {"game_question_id": str(gq.id), "timeout": True})
        except GameError:
            pass
        self.assertFalse(PlayerAnswer.objects.filter(game_question=gq, room_member=host).exists())
        submit_dirka(host.id, {"game_question_id": str(gq.id), "option_id": correct.id})
        self.assertTrue(PlayerAnswer.objects.filter(game_question=gq, room_member=host).exists())

    def test_guest_can_advance_when_host_offline(self):
        host, guest = self._start()
        session = GameSession.objects.get(room=host.room)
        gq = session.game_questions.get(order=0)
        correct = gq.question.options.get(is_correct=True)
        submit_dirka(host.id, {"game_question_id": str(gq.id), "option_id": correct.id})
        submit_dirka(guest.id, {"game_question_id": str(gq.id), "option_id": correct.id})
        set_member_connected(host.id, True)
        set_member_connected(host.id, False)
        host.refresh_from_db()
        self.assertFalse(host.is_connected)
        out = next_dirka(guest.id)
        self.assertEqual(out[0]["phase"], "question")


class LobbyPayloadStabilityTests(TestCase):
    def setUp(self):
        ensure_bonuses_and_friends()
        self.category = Category.objects.create(slug="stab-lobby", name="StabLobby", is_active=True)
        for index in range(8):
            make_mc(self.category, f"stab-l-{index}")
        self.host = APIClient()
        self.guest = APIClient()
        self.host.post("/api/auth/guest/", {"nickname": "LHost"}, format="json")
        self.guest.post("/api/auth/guest/", {"nickname": "LGuest"}, format="json")

    def test_lobby_payload_while_playing_returns_game_snapshot(self):
        created = self.host.post(
            "/api/rooms/",
            {
                "mode": "multiplayer",
                "nickname": "LHost",
                "visibility": "public",
                "max_players": 4,
                "question_count": 5,
                "time_limit_seconds": 30,
                "categories": ["stab-lobby"],
                "bot_count": 0,
            },
            format="json",
        )
        code = created.data["code"]
        self.guest.post(f"/api/rooms/{code}/join/", {"nickname": "LGuest"}, format="json")
        self.host.post(f"/api/rooms/{code}/ready/", {"ready": True}, format="json")
        self.guest.post(f"/api/rooms/{code}/ready/", {"ready": True}, format="json")
        host = RoomMember.objects.get(room__code=code, is_host=True, is_bot=False)
        start_multiplayer(host.id)
        room = Room.objects.get(code=code)
        self.assertEqual(room.status, "playing")

        consumer = GameConsumer()
        consumer.code = code
        consumer.member_id = str(host.id)
        payload = consumer._lobby_payload()
        self.assertNotEqual(payload.get("phase"), "lobby")
        self.assertIn(payload.get("phase"), {"question", "round_review", "finished", "answer_progress"})


class StaleRoomCloseTests(TestCase):
    def setUp(self):
        self.category = Category.objects.create(slug="stab-idle", name="StabIdle", is_active=True)
        for index in range(10):
            make_mc(self.category, f"stab-i-{index}")
        self.client = APIClient()
        self.client.post("/api/auth/guest/", {"nickname": "IdleHost"}, format="json")

    def test_active_session_not_closed_as_stale(self):
        created = self.client.post(
            "/api/rooms/",
            {
                "mode": MODE_60_SEKUND,
                "nickname": "IdleHost",
                "categories": ["stab-idle"],
            },
            format="json",
        )
        member = RoomMember.objects.get(room__code=created.data["code"], is_host=True)
        start_sixty(member.id)
        room = member.room
        room.last_activity = timezone.now() - timedelta(days=2)
        room.status = "playing"
        room.save(update_fields=["last_activity", "status"])
        closed = close_stale_rooms()
        room.refresh_from_db()
        session = GameSession.objects.get(room=room)
        self.assertEqual(session.status, "active")
        self.assertNotEqual(room.status, "closed")
        # waiting empty rooms can still close
        self.assertGreaterEqual(closed, 0)

    def test_close_live_rooms_closes_waiting_and_playing(self):
        waiting = self.client.post(
            "/api/rooms/",
            {
                "mode": MODE_MULTIPLAYER,
                "nickname": "IdleHost",
                "visibility": "unlisted",
                "max_players": 4,
                "bot_count": 1,
                "question_count": 5,
                "time_limit_seconds": 30,
                "categories": ["stab-idle"],
            },
            format="json",
        )
        self.assertEqual(waiting.status_code, 200, waiting.data)
        wait_code = waiting.data["code"]

        playing = self.client.post(
            "/api/rooms/",
            {
                "mode": MODE_60_SEKUND,
                "nickname": "IdleHost",
                "categories": ["stab-idle"],
            },
            format="json",
        )
        self.assertEqual(playing.status_code, 200, playing.data)
        play_member = RoomMember.objects.get(room__code=playing.data["code"], is_host=True)
        start_sixty(play_member.id)
        play_room = play_member.room
        play_room.refresh_from_db()
        self.assertEqual(play_room.status, "playing")

        closed = close_live_rooms()
        self.assertGreaterEqual(closed, 2)
        from rooms.models import Room

        self.assertEqual(Room.objects.get(code=wait_code).status, "closed")
        play_room.refresh_from_db()
        self.assertEqual(play_room.status, "closed")
        session = GameSession.objects.get(room=play_room)
        self.assertEqual(session.status, "aborted")


class RequireAdvanceTests(TestCase):
    def test_require_can_advance_blocks_when_host_online(self):
        ensure_bonuses_and_friends()
        category = Category.objects.create(slug="adv", name="Adv", is_active=True)
        for index in range(8):
            make_mc(category, f"adv-{index}")
        host_c = APIClient()
        guest_c = APIClient()
        host_c.post("/api/auth/guest/", {"nickname": "AH"}, format="json")
        guest_c.post("/api/auth/guest/", {"nickname": "AG"}, format="json")
        created = host_c.post(
            "/api/rooms/",
            {
                "mode": "multiplayer",
                "nickname": "AH",
                "visibility": "public",
                "max_players": 4,
                "question_count": 5,
                "time_limit_seconds": 30,
                "categories": ["adv"],
                "bot_count": 0,
            },
            format="json",
        )
        code = created.data["code"]
        guest_c.post(f"/api/rooms/{code}/join/", {"nickname": "AG"}, format="json")
        host = RoomMember.objects.get(room__code=code, is_host=True)
        guest = RoomMember.objects.get(room__code=code, is_host=False)
        set_member_connected(host.id, True)
        with self.assertRaises(GameError):
            require_can_advance(guest, host.room)
        set_member_connected(host.id, False)
        require_can_advance(guest, host.room)  # ne vrže
