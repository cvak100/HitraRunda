from django.test import TestCase

from accounts.models import User
from game.flags import next_flags, snapshot_flags, start_flags, submit_flags
from game.modes import MODE_ZASTAVE
from game.models import GameResult, GameSession
from geo.importer import ensure_seed_countries
from geo.models import Country
from rooms.models import Room, RoomMember


class FlagsModeTests(TestCase):
    def setUp(self):
        ensure_seed_countries()
        self.user = User.objects.create_user(
            username="flags@test.local",
            email="flags@test.local",
            password="zelo-dolgo-geslo",
            nickname="Zastave",
        )
        self.room = Room.objects.create(
            code="FLAG01",
            host=self.user,
            status="waiting",
            settings={
                "mode": MODE_ZASTAVE,
                "continent": "europe",
                "flag_kinds": ["flag_to_name"],
                "time_limit_seconds": 15,
                "categories": [],
                "question_count": 0,
            },
        )
        self.member = RoomMember.objects.create(
            room=self.room,
            user=self.user,
            nickname_in_room="Zastave",
            is_host=True,
        )

    def test_seed_has_europe(self):
        self.assertGreaterEqual(
            Country.objects.filter(continent="europe", active=True).count(), 4
        )

    def test_solo_flow_two_questions(self):
        payloads = start_flags(str(self.member.id))
        self.assertEqual(payloads[0]["phase"], "question")
        self.assertEqual(payloads[0]["mode"], MODE_ZASTAVE)

        session = GameSession.objects.get(room=self.room, status="active")
        state = dict(session.state or {})
        pool = list(state["pool"][:2])
        state["pool"] = pool
        state["index"] = 0
        session.total_questions = 2
        session.state = state
        session.save(update_fields=["state", "total_questions"])

        import random
        from game.flags import _deal_current

        _deal_current(session, random.Random(42))

        snap = snapshot_flags(str(self.member.id))
        self.assertEqual(snap["phase"], "question")
        qid = snap["question"]["game_question_id"]
        session.refresh_from_db()
        correct = (session.state or {})["current"]["correct_id"]
        review = submit_flags(
            str(self.member.id),
            {"game_question_id": qid, "option_id": correct},
        )
        self.assertEqual(len(review), 1)
        self.assertEqual(review[0]["phase"], "review")
        self.assertTrue(review[0]["is_correct"])

        nxt = next_flags(str(self.member.id))
        self.assertEqual(nxt[0]["phase"], "question")
        qid2 = nxt[0]["question"]["game_question_id"]
        end = submit_flags(
            str(self.member.id),
            {"game_question_id": qid2, "option_id": "xx"},
        )
        self.assertEqual(end[0]["phase"], "review")
        self.assertFalse(end[0]["is_correct"])
        self.assertEqual(end[1]["phase"], "finished")
        self.assertTrue(
            GameResult.objects.filter(mode=MODE_ZASTAVE, room_code="FLAG01").exists()
        )

    def test_validate_create_room(self):
        self.client.force_login(self.user)
        # Guest/auth API: create room via engine path used by rooms API.
        from game.engine import validate_settings

        settings = validate_settings(
            {
                "mode": MODE_ZASTAVE,
                "continent": "europe",
                "time_limit_seconds": 15,
            }
        )
        self.assertEqual(settings["mode"], MODE_ZASTAVE)
        self.assertEqual(settings["continent"], "europe")
        self.assertEqual(settings["categories"], [])
