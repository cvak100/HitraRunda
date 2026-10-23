from django.test import TestCase
from rest_framework.test import APIClient

from game.dirka import start_dirka, submit_dirka, use_dirka_bonus
from game.modes import MODE_DIRKA
from game.models import GameSession
from game.seed_content import ensure_bonuses_and_friends
from questions.models import Category, Question, QuestionOption
from rooms.models import RoomMember


def make_questions(category, count=12):
    for index in range(count):
        question = Question.objects.create(
            external_key=f"dirka-{index}",
            category=category,
            question_type=Question.Type.MULTIPLE_CHOICE,
            difficulty=min(5, 1 + index // 2),
            text=f"Dirka Q {index}",
            is_active=True,
        )
        QuestionOption.objects.create(question=question, text="A", is_correct=True, order=0)
        QuestionOption.objects.create(question=question, text="B", is_correct=False, order=1)
        QuestionOption.objects.create(question=question, text="C", is_correct=False, order=2)
        QuestionOption.objects.create(question=question, text="D", is_correct=False, order=3)


class DirkaTests(TestCase):
    def setUp(self):
        ensure_bonuses_and_friends()
        self.category = Category.objects.create(slug="dirka-cat", name="Dirka", is_active=True)
        make_questions(self.category, 12)
        self.host = APIClient()
        self.guest = APIClient()
        self.host.post("/api/auth/guest/", {"nickname": "HostD"}, format="json")
        self.guest.post("/api/auth/guest/", {"nickname": "GuestD"}, format="json")

    def _room_and_members(self):
        created = self.host.post(
            "/api/rooms/",
            {
                "mode": "dirka",
                "nickname": "HostD",
                "visibility": "public",
                "max_players": 4,
                "target_score": 100,
                "safe_every": 5,
                "categories": ["dirka-cat"],
                "bot_count": 0,
            },
            format="json",
        )
        self.assertEqual(created.status_code, 200, created.content)
        code = created.data["code"]
        joined = self.guest.post(f"/api/rooms/{code}/join/", {"nickname": "GuestD"}, format="json")
        self.assertEqual(joined.status_code, 200, joined.content)
        self.host.post(f"/api/rooms/{code}/ready/", {"ready": True}, format="json")
        self.guest.post(f"/api/rooms/{code}/ready/", {"ready": True}, format="json")
        host_member = RoomMember.objects.get(room__code=code, is_host=True, is_bot=False)
        guest_member = RoomMember.objects.exclude(pk=host_member.pk).get(room__code=code, is_bot=False)
        return code, host_member, guest_member

    def test_start_and_score_toward_target(self):
        _code, host_member, guest_member = self._room_and_members()
        started = start_dirka(host_member.id)
        self.assertEqual(started[0]["mode"], MODE_DIRKA)
        self.assertEqual(started[0]["target_score"], 100)
        host_id = str(host_member.id)
        self.assertEqual(started[0]["players"][host_id]["bonuses"], {})
        # Bot/host ne smejo deliti bonusov na root.
        self.assertNotIn("bonuses", started[0])

        session = GameSession.objects.get(room=host_member.room)
        gq = session.game_questions.get(order=0)
        correct = gq.question.options.get(is_correct=True)
        submit_dirka(host_member.id, {"game_question_id": str(gq.id), "option_id": correct.id})
        payloads = submit_dirka(guest_member.id, {"game_question_id": str(gq.id), "option_id": correct.id})
        self.assertEqual(payloads[0]["phase"], "round_review")
        host_row = next(row for row in payloads[0]["standings"] if row["member_id"] == host_id)
        self.assertGreater(host_row["score"], 0)

    def test_use_fifty_fifty(self):
        _code, host_member, _guest = self._room_and_members()
        start_dirka(host_member.id)
        session = GameSession.objects.get(room=host_member.room)
        state = dict(session.state or {})
        players = dict(state.get("players") or {})
        key = str(host_member.id)
        stats = dict(players.get(key) or {})
        stats["bonuses"] = {"fifty_fifty": 1}
        players[key] = stats
        state["players"] = players
        session.state = state
        session.save(update_fields=["state"])
        gq = session.game_questions.get(order=0)
        result = use_dirka_bonus(
            host_member.id,
            {"effect": "fifty_fifty", "game_question_id": str(gq.id)},
        )
        self.assertEqual(result[0]["bonus"]["effect"], "fifty_fifty")
        self.assertEqual(len(result[0]["bonus"]["eliminated_option_ids"]), 2)
        host_id = str(host_member.id)
        self.assertEqual(result[0]["players"][host_id]["bonuses"].get("fifty_fifty", 0), 0)
        self.assertEqual(result[0]["bonus_member_id"], host_id)
