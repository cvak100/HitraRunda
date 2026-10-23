"""E2E-ish smoke: lobby → igra → finish → lestvica (Hitra tekma + Dirka)."""

from django.test import TestCase
from rest_framework.test import APIClient

from game.engine import submit_answer
from game.modes import MODE_DIRKA, MODE_MULTIPLAYER
from game.models import GameResult, GameSession
from game.multiplayer import next_multiplayer, start_multiplayer
from game.seed_content import ensure_bots
from game.simulate import simulate_match
from questions.models import Category, Question, QuestionOption
from rooms.models import RoomMember


def make_questions(category, count=20):
    for index in range(count):
        question = Question.objects.create(
            external_key=f"smoke-{category.slug}-{index}",
            category=category,
            question_type=Question.Type.MULTIPLE_CHOICE,
            difficulty=min(5, 1 + index // 4),
            text=f"Smoke {index}",
            is_active=True,
        )
        QuestionOption.objects.create(question=question, text="A", is_correct=True, order=0)
        QuestionOption.objects.create(question=question, text="B", is_correct=False, order=1)


class SmokeFlowTests(TestCase):
    def setUp(self):
        ensure_bots()
        self.category = Category.objects.create(slug="smoke", name="Smoke", is_active=True)
        make_questions(self.category, 24)
        self.host = APIClient()
        self.guest = APIClient()
        self.host.post("/api/auth/guest/", {"nickname": "Hitri ris"}, format="json")
        self.guest.post("/api/auth/guest/", {"nickname": "Tihi volk"}, format="json")

    def test_guest_gets_avatar_and_color(self):
        me = self.host.get("/api/auth/me/")
        self.assertEqual(me.status_code, 200)
        self.assertTrue(me.data["user"]["avatar"])
        self.assertTrue(me.data["user"]["preferred_color"])

    def test_multiplayer_lobby_to_leaderboard(self):
        created = self.host.post(
            "/api/rooms/",
            {
                "mode": MODE_MULTIPLAYER,
                "nickname": "Hitri ris",
                "visibility": "public",
                "max_players": 4,
                "bot_count": 1,
                "question_count": 5,
                "time_limit_seconds": 30,
                "categories": ["smoke"],
            },
            format="json",
        )
        self.assertEqual(created.status_code, 200, created.data)
        code = created.data["code"]
        joined = self.guest.post(f"/api/rooms/{code}/join/", {"nickname": "Tihi volk"}, format="json")
        self.assertEqual(joined.status_code, 200, joined.data)

        self.host.post(f"/api/rooms/{code}/ready/", {"ready": True}, format="json")
        self.guest.post(f"/api/rooms/{code}/ready/", {"ready": True}, format="json")

        host_member = RoomMember.objects.get(room__code=code, is_host=True)
        members = list(RoomMember.objects.filter(room__code=code, left_at__isnull=True))
        start_multiplayer(host_member.id)
        session = GameSession.objects.get(room__code=code)

        for order in range(session.total_questions):
            gq = session.game_questions.get(order=order)
            correct = gq.question.options.get(is_correct=True)
            for member in members:
                submit_answer(
                    str(member.id),
                    {"game_question_id": str(gq.id), "option_id": correct.id},
                )
            if order + 1 < session.total_questions:
                next_multiplayer(str(host_member.id))
            else:
                next_multiplayer(str(host_member.id))

        session.refresh_from_db()
        self.assertEqual(session.status, "finished")
        self.assertTrue(GameResult.objects.filter(mode=MODE_MULTIPLAYER, room_code=code).exists())

        board = self.host.get("/api/leaderboard/?mode=multiplayer&limit=100")
        self.assertEqual(board.status_code, 200)
        self.assertIn("results", board.data)

        left = self.guest.post(f"/api/rooms/{code}/leave/", {}, format="json")
        # Soba je finished — leave lahko vrne napako ali OK; ne sme crashati.
        self.assertIn(left.status_code, {200, 400})

    def test_leave_lobby_does_not_stick(self):
        created = self.host.post(
            "/api/rooms/",
            {
                "mode": MODE_MULTIPLAYER,
                "nickname": "Hitri ris",
                "visibility": "public",
                "max_players": 4,
                "bot_count": 0,
                "question_count": 5,
                "time_limit_seconds": 30,
                "categories": ["smoke"],
            },
            format="json",
        )
        self.assertEqual(created.status_code, 200, created.data)
        code = created.data["code"]
        self.guest.post(f"/api/rooms/{code}/join/", {"nickname": "Tihi volk"}, format="json")
        left = self.guest.post(f"/api/rooms/{code}/leave/", {}, format="json")
        self.assertEqual(left.status_code, 200, left.data)
        detail = self.host.get(f"/api/rooms/{code}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["member_count"], 1)

    def test_simulate_multiplayer_and_dirka(self):
        staff = APIClient()
        from accounts.models import User

        admin = User.objects.create_user(
            username="admin@smoke.local",
            email="admin@smoke.local",
            password="geslo12345",
            nickname="Admin",
            is_staff=True,
        )
        staff.force_login(admin)

        mp = simulate_match(
            admin,
            {
                "mode": MODE_MULTIPLAYER,
                "bot_count": 2,
                "question_count": 5,
                "categories": ["smoke"],
                "count_for_leaderboard": True,
            },
        )
        self.assertEqual(mp["status"], "finished")
        self.assertGreaterEqual(len(mp["results"]), 2)

        dirka = simulate_match(
            admin,
            {
                "mode": MODE_DIRKA,
                "bot_count": 2,
                "target_score": 100,
                "safe_every": 5,
                "categories": ["smoke"],
                "count_for_leaderboard": True,
                "max_rounds": 60,
            },
        )
        self.assertEqual(dirka["status"], "finished")
        self.assertGreaterEqual(len(dirka["results"]), 2)

        api_sim = staff.post(
            "/api/admin/simulate/",
            {"mode": "multiplayer", "bot_count": 2, "question_count": 5, "categories": ["smoke"]},
            format="json",
        )
        self.assertEqual(api_sim.status_code, 200, api_sim.data)
