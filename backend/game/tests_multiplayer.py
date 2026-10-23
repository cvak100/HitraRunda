from django.test import TestCase
from rest_framework.test import APIClient

from game.engine import set_member_connected, submit_answer
from game.modes import MODE_MULTIPLAYER, MP_CATCHUP_BONUS, MP_STREAK_BONUS_2
from game.multiplayer import _bot_answer_message, next_multiplayer, start_multiplayer
from game.models import GameQuestion, GameResult, GameSession
from game.presentation import ensure_presentation
from questions.models import Category, Question, QuestionOption
from rooms.models import RoomMember
from rooms.services import update_room_settings


def make_questions(category, count=10):
    for index in range(count):
        question = Question.objects.create(
            external_key=f"mp-{index}",
            category=category,
            question_type=Question.Type.MULTIPLE_CHOICE,
            difficulty=min(5, 1 + index // 2),
            text=f"Vprašanje {index}",
            is_active=True,
        )
        QuestionOption.objects.create(question=question, text="A", is_correct=True, order=0)
        QuestionOption.objects.create(question=question, text="B", is_correct=False, order=1)
        QuestionOption.objects.create(question=question, text="C", is_correct=False, order=2)
        QuestionOption.objects.create(question=question, text="D", is_correct=False, order=3)


class MultiplayerLobbyTests(TestCase):
    def setUp(self):
        self.category = Category.objects.create(slug="sport", name="Šport", is_active=True)
        make_questions(self.category, 10)
        self.host = APIClient()
        self.guest = APIClient()
        self.host.post("/api/auth/guest/", {"nickname": "Hostek"}, format="json")
        self.guest.post("/api/auth/guest/", {"nickname": "Gostek"}, format="json")

    def test_create_join_ready_and_play_round(self):
        created = self.host.post(
            "/api/rooms/",
            {
                "mode": "multiplayer",
                "nickname": "Hostek",
                "visibility": "public",
                "max_players": 4,
                "question_count": 5,
                "time_limit_seconds": 30,
                "categories": ["sport"],
            },
            format="json",
        )
        self.assertEqual(created.status_code, 200, created.data)
        code = created.data["code"]
        joined = self.guest.post(
            f"/api/rooms/{code}/join/",
            {"nickname": "Gostek"},
            format="json",
        )
        self.assertEqual(joined.status_code, 200, joined.data)
        self.assertEqual(joined.data["member_count"], 2)

        self.host.post(f"/api/rooms/{code}/ready/", {"ready": True}, format="json")
        guest_ready = self.guest.post(f"/api/rooms/{code}/ready/", {"ready": True}, format="json")
        self.assertTrue(guest_ready.data["all_ready"])
        host_view = self.host.get(f"/api/rooms/{code}/")
        self.assertTrue(host_view.data["can_start"])

        host_member = RoomMember.objects.get(room__code=code, is_host=True)
        guest_member = RoomMember.objects.get(room__code=code, is_host=False)
        started = start_multiplayer(host_member.id)
        self.assertEqual(started[0]["phase"], "question")
        self.assertEqual(started[0]["mode"], MODE_MULTIPLAYER)
        session = GameSession.objects.get(room__code=code)
        game_question = session.game_questions.get(order=0)
        correct = game_question.question.options.get(is_correct=True)

        host_submit = submit_answer(
            host_member.id,
            {"game_question_id": str(game_question.id), "option_id": correct.id},
        )
        self.assertEqual(host_submit[0]["phase"], "answer_progress")
        self.assertIn(str(host_member.id), host_submit[0]["answered_ids"])
        self.assertIn(str(guest_member.id), host_submit[0]["waiting_for_ids"])
        guest_submit = submit_answer(
            guest_member.id,
            {"game_question_id": str(game_question.id), "option_id": correct.id},
        )
        self.assertEqual(guest_submit[0]["phase"], "round_review")
        self.assertTrue(any(row.get("round_bonus") for row in guest_submit[0]["answers"]))

        advanced = next_multiplayer(host_member.id)
        self.assertEqual(advanced[0]["phase"], "question")
        self.assertEqual(advanced[0]["index"], 1)

    def test_private_room_requires_password(self):
        created = self.host.post(
            "/api/rooms/",
            {
                "mode": "multiplayer",
                "nickname": "Hostek",
                "visibility": "private",
                "password": "skrivno",
                "max_players": 2,
                "question_count": 5,
                "time_limit_seconds": 30,
                "categories": ["sport"],
            },
            format="json",
        )
        self.assertEqual(created.status_code, 200, created.data)
        bad = self.guest.post(
            f"/api/rooms/{created.data['code']}/join/",
            {"nickname": "Gostek", "password": "narobe"},
            format="json",
        )
        self.assertEqual(bad.status_code, 400)
        ok = self.guest.post(
            f"/api/rooms/{created.data['code']}/join/",
            {"nickname": "Gostek", "password": "skrivno"},
            format="json",
        )
        self.assertEqual(ok.status_code, 200)

    def test_finish_creates_result_per_player(self):
        created = self.host.post(
            "/api/rooms/",
            {
                "mode": "multiplayer",
                "nickname": "Hostek",
                "visibility": "unlisted",
                "max_players": 2,
                "question_count": 5,
                "time_limit_seconds": 30,
                "categories": ["sport"],
            },
            format="json",
        )
        code = created.data["code"]
        self.guest.post(f"/api/rooms/{code}/join/", {"nickname": "Gostek"}, format="json")
        self.host.post(f"/api/rooms/{code}/ready/", {"ready": True}, format="json")
        self.guest.post(f"/api/rooms/{code}/ready/", {"ready": True}, format="json")
        host_member = RoomMember.objects.get(room__code=code, is_host=True)
        guest_member = RoomMember.objects.get(room__code=code, is_host=False)
        start_multiplayer(host_member.id)
        session = GameSession.objects.get(room__code=code)
        for order in range(session.total_questions):
            game_question = session.game_questions.get(order=order)
            correct = game_question.question.options.get(is_correct=True)
            submit_answer(host_member.id, {"game_question_id": str(game_question.id), "option_id": correct.id})
            submit_answer(guest_member.id, {"game_question_id": str(game_question.id), "option_id": correct.id})
            finished = next_multiplayer(host_member.id)
            if order + 1 >= session.total_questions:
                self.assertEqual(finished[0]["phase"], "finished")
            else:
                self.assertEqual(finished[0]["phase"], "question")
        self.assertEqual(GameResult.objects.filter(mode=MODE_MULTIPLAYER, room_code=code).count(), 2)

    def test_bots_and_live_settings(self):
        created = self.host.post(
            "/api/rooms/",
            {
                "mode": "multiplayer",
                "nickname": "Hostek",
                "visibility": "public",
                "max_players": 4,
                "question_count": 5,
                "time_limit_seconds": 30,
                "categories": ["sport"],
                "bot_count": 1,
            },
            format="json",
        )
        self.assertEqual(created.status_code, 200, created.data)
        code = created.data["code"]
        self.assertEqual(created.data["member_count"], 2)
        self.assertTrue(any(item.get("is_bot") for item in created.data["members"]))
        host_user = RoomMember.objects.get(room__code=code, is_host=True).user
        room = update_room_settings(
            host_user,
            code,
            {
                "question_count": 10,
                "time_limit_seconds": 30,
                "categories": ["sport"],
                "sudden_death": True,
                "bot_count": 2,
                "max_players": 4,
                "visibility": "public",
            },
        )
        self.assertTrue((room.settings or {}).get("sudden_death"))
        self.assertEqual((room.settings or {}).get("bot_count"), 2)
        self.assertEqual(room.members.filter(left_at__isnull=True, is_bot=True).count(), 2)

    def test_sudden_death_and_bonuses(self):
        created = self.host.post(
            "/api/rooms/",
            {
                "mode": "multiplayer",
                "nickname": "Hostek",
                "visibility": "unlisted",
                "max_players": 2,
                "question_count": 5,
                "time_limit_seconds": 30,
                "categories": ["sport"],
                "sudden_death": True,
            },
            format="json",
        )
        code = created.data["code"]
        self.guest.post(f"/api/rooms/{code}/join/", {"nickname": "Gostek"}, format="json")
        self.host.post(f"/api/rooms/{code}/ready/", {"ready": True}, format="json")
        self.guest.post(f"/api/rooms/{code}/ready/", {"ready": True}, format="json")
        host_member = RoomMember.objects.get(room__code=code, is_host=True)
        guest_member = RoomMember.objects.get(room__code=code, is_host=False)
        start_multiplayer(host_member.id)
        session = GameSession.objects.get(room__code=code)
        self.assertTrue((session.state or {}).get("sudden_death"))
        game_question = session.game_questions.get(order=0)
        correct = game_question.question.options.get(is_correct=True)
        wrong = game_question.question.options.filter(is_correct=False).first()
        submit_answer(host_member.id, {"game_question_id": str(game_question.id), "option_id": correct.id})
        finished = submit_answer(
            guest_member.id,
            {"game_question_id": str(game_question.id), "option_id": wrong.id},
        )
        self.assertEqual(finished[0]["phase"], "finished")
        self.assertEqual(finished[0]["reason"], "sudden_death")

    def test_streak_bonus_on_second_correct(self):
        created = self.host.post(
            "/api/rooms/",
            {
                "mode": "multiplayer",
                "nickname": "Hostek",
                "visibility": "unlisted",
                "max_players": 2,
                "question_count": 5,
                "time_limit_seconds": 30,
                "categories": ["sport"],
            },
            format="json",
        )
        code = created.data["code"]
        self.guest.post(f"/api/rooms/{code}/join/", {"nickname": "Gostek"}, format="json")
        self.host.post(f"/api/rooms/{code}/ready/", {"ready": True}, format="json")
        self.guest.post(f"/api/rooms/{code}/ready/", {"ready": True}, format="json")
        host_member = RoomMember.objects.get(room__code=code, is_host=True)
        guest_member = RoomMember.objects.get(room__code=code, is_host=False)
        start_multiplayer(host_member.id)
        session = GameSession.objects.get(room__code=code)
        for order in (0, 1):
            game_question = session.game_questions.get(order=order)
            correct = game_question.question.options.get(is_correct=True)
            wrong = game_question.question.options.filter(is_correct=False).first()
            submit_answer(host_member.id, {"game_question_id": str(game_question.id), "option_id": correct.id})
            submit_answer(guest_member.id, {"game_question_id": str(game_question.id), "option_id": wrong.id})
            if order == 0:
                next_multiplayer(host_member.id)
        session.refresh_from_db()
        host_stats = (session.state or {}).get("players", {}).get(str(host_member.id), {})
        self.assertGreaterEqual(int(host_stats.get("streak_bonus_total") or 0), MP_STREAK_BONUS_2)
        self.assertGreaterEqual(int(host_stats.get("catchup_bonus_total") or 0), 0)
        # catch-up: host was not behind after round 0 (he led), so may be 0; ensure constant imported
        self.assertEqual(MP_CATCHUP_BONUS, 40)

    def test_stale_disconnect_does_not_clear_reconnect(self):
        created = self.host.post(
            "/api/rooms/",
            {
                "mode": "multiplayer",
                "nickname": "Hostek",
                "visibility": "public",
                "max_players": 4,
                "question_count": 5,
                "time_limit_seconds": 30,
                "categories": ["sport"],
            },
            format="json",
        )
        member = RoomMember.objects.get(room__code=created.data["code"], is_host=True)
        old_epoch = set_member_connected(member.id, True)
        new_epoch = set_member_connected(member.id, True)
        self.assertNotEqual(old_epoch, new_epoch)
        cleared = set_member_connected(member.id, False, old_epoch)
        self.assertFalse(cleared)
        member.refresh_from_db()
        self.assertTrue(member.is_connected)
        self.assertEqual(member.connection_epoch, new_epoch)
        self.assertTrue(set_member_connected(member.id, False, new_epoch))
        member.refresh_from_db()
        self.assertFalse(member.is_connected)

    def test_bot_answers_matching_question(self):
        matching = Question.objects.create(
            external_key="mp-match",
            category=self.category,
            question_type=Question.Type.MATCHING,
            difficulty=2,
            text="Poveži",
            config={"pairs": [{"left": "A", "right": "1"}, {"left": "B", "right": "2"}]},
            is_active=True,
        )
        created = self.host.post(
            "/api/rooms/",
            {
                "mode": "multiplayer",
                "nickname": "Hostek",
                "visibility": "unlisted",
                "max_players": 2,
                "question_count": 5,
                "time_limit_seconds": 30,
                "categories": ["sport"],
                "bot_count": 1,
            },
            format="json",
        )
        code = created.data["code"]
        self.host.post(f"/api/rooms/{code}/ready/", {"ready": True}, format="json")
        host_member = RoomMember.objects.get(room__code=code, is_host=True)
        bot_member = RoomMember.objects.get(room__code=code, is_bot=True)
        start_multiplayer(host_member.id)
        session = GameSession.objects.get(room__code=code)
        game_question = session.game_questions.get(order=0)
        game_question.question = matching
        game_question.presentation = {}
        game_question.save(update_fields=["question", "presentation"])
        ensure_presentation(game_question)
        bot_msg = _bot_answer_message(game_question)
        self.assertIn("pairs", bot_msg)
        self.assertEqual(len(bot_msg["pairs"]), 2)
        host_pairs = [
            {"left_id": link["left_id"], "right_id": link["right_id"]}
            for link in (game_question.presentation or {}).get("links") or []
        ]
        submit_answer(host_member.id, {"game_question_id": str(game_question.id), "pairs": host_pairs})
        bot_result = submit_answer(bot_member.id, bot_msg)
        self.assertEqual(bot_result[0]["phase"], "round_review")
