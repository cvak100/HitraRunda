import json
from datetime import timedelta

from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from game.engine import (
    GameError,
    grade_answer,
    next_question,
    select_questions,
    start_game,
    submit_answer,
)
from game.models import GameQuestion, GameResult, GameSession, PlayerAnswer
from game.presentation import public_question
from game.routing import websocket_urlpatterns
from questions.models import Category, Question, QuestionOption
from rooms.models import Room, RoomMember
from rooms.services import create_solo_room


def choice_question(category, key, difficulty, correct="Prav", wrong="Narobe"):
    question = Question.objects.create(
        category=category,
        external_key=key,
        text=f"Vprašanje {key}",
        difficulty=difficulty,
        question_type=Question.Type.MULTIPLE_CHOICE,
    )
    QuestionOption.objects.create(question=question, text=correct, is_correct=True, order=0)
    QuestionOption.objects.create(question=question, text=wrong, is_correct=False, order=1)
    return question


class EngineTests(TestCase):
    def setUp(self):
        self.category = Category.objects.create(name="Šport", slug="sport", order=1)
        for index in range(5):
            choice_question(self.category, f"q{index}", index + 1)
        self.user = User.objects.create_user(
            username="ana@example.com",
            email="ana@example.com",
            password="zelo-dolgo-geslo",
            nickname="Ana",
        )
        self.room = create_solo_room(
            self.user,
            {"question_count": 5, "categories": ["sport"], "time_limit_seconds": 20},
        )
        self.member = self.room.members.get()

    def test_selection_increases_difficulty_without_repeats(self):
        picked = select_questions(["sport"], 5)
        self.assertEqual([question.difficulty for question in picked], [1, 2, 3, 4, 5])
        self.assertEqual(len({question.id for question in picked}), 5)
        with self.assertRaises(GameError):
            select_questions(["sport"], 6)

    def test_wrong_answer_ends_on_zero_and_correct_then_wrong_keeps_prize(self):
        started = start_game(self.member.id)[0]
        self.assertEqual(started["type"], "game_started")
        self.assertNotIn("explanation", started["question"])
        self.assertNotIn("is_correct", json.dumps(started["question"]))

        correct = self._answer(started, True)
        self.assertFalse(correct[0]["finished"])
        self.assertEqual(correct[0]["prize_reached"], 100)
        self.assertEqual(PlayerAnswer.objects.count(), 1)
        again = submit_answer(
            self.member.id,
            {
                "game_question_id": started["question"]["game_question_id"],
                "option_id": self._option(started, True).id,
            },
        )
        self.assertEqual(PlayerAnswer.objects.count(), 1)
        self.assertEqual(again[0]["correct_count"], 1)

        nxt = next_question(self.member.id)[0]
        wrong = self._answer(nxt, False)
        self.assertTrue(wrong[0]["finished"])
        self.assertEqual(wrong[0]["reason"], "wrong")
        self.assertEqual(wrong[0]["prize_reached"], 100)
        self.assertGreaterEqual(wrong[0]["score"], 100)
        self.assertEqual(GameResult.objects.get().prize_reached, 100)
        self.room.refresh_from_db()
        self.assertEqual(self.room.status, "finished")
        self.assertEqual(GameSession.objects.count(), 1)
        again_start = start_game(self.member.id)[0]
        self.assertEqual(again_start["phase"], "finished")
        self.assertEqual(GameSession.objects.count(), 1)

    def test_timeout_rules_and_hidden_slider(self):
        started = start_game(self.member.id)[0]
        ignored = submit_answer(
            self.member.id,
            {"game_question_id": started["question"]["game_question_id"], "timeout": True},
        )
        self.assertEqual(ignored, [])
        self.assertEqual(PlayerAnswer.objects.count(), 0)

        game_question = GameQuestion.objects.get(pk=started["question"]["game_question_id"])
        game_question.started_at = timezone.now() - timedelta(seconds=40)
        game_question.save(update_fields=["started_at"])
        late = self._answer(started, True)
        self.assertTrue(late[0]["timed_out"])
        self.assertFalse(late[0]["is_correct"])
        self.assertEqual(late[0]["reason"], "timeout")

        slider = Question.objects.create(
            category=self.category,
            external_key="slider-test",
            text="Koliko?",
            difficulty=3,
            question_type=Question.Type.SLIDER,
            config={"min": 0, "max": 4000, "step": 1, "correct": 2864, "tolerance": 50},
            explanation="Skrivnost",
        )
        holder = GameQuestion.objects.create(
            game_session=GameSession.objects.get(),
            question=slider,
            order=9,
        )
        payload = public_question(holder)
        self.assertEqual(set(payload["slider"]), {"min", "max", "step"})
        self.assertNotIn("explanation", payload)
        self.assertTrue(grade_answer(slider, {"value": 2900}))
        self.assertFalse(grade_answer(slider, {"value": 2000}))

    def test_ordering_and_matching(self):
        start_game(self.member.id)
        ordering = Question.objects.create(
            category=self.category,
            external_key="order-test",
            text="Razvrsti",
            difficulty=2,
            question_type=Question.Type.ORDERING,
        )
        first = QuestionOption.objects.create(question=ordering, text="A", order=0)
        second = QuestionOption.objects.create(question=ordering, text="B", order=1)
        self.assertTrue(grade_answer(ordering, {"option_ids": [first.id, second.id]}))
        self.assertFalse(grade_answer(ordering, {"option_ids": [second.id, first.id]}))

        multi = Question.objects.create(
            category=self.category,
            external_key="multi-test",
            text="Izberi vse",
            difficulty=2,
            question_type=Question.Type.MULTI_SELECT,
        )
        yes_a = QuestionOption.objects.create(question=multi, text="A", is_correct=True, order=0)
        yes_b = QuestionOption.objects.create(question=multi, text="B", is_correct=True, order=1)
        no_c = QuestionOption.objects.create(question=multi, text="C", is_correct=False, order=2)
        self.assertTrue(grade_answer(multi, {"option_ids": [yes_a.id, yes_b.id]}))
        self.assertFalse(grade_answer(multi, {"option_ids": [yes_a.id]}))
        self.assertFalse(grade_answer(multi, {"option_ids": [yes_a.id, yes_b.id, no_c.id]}))

        matching = Question.objects.create(
            category=self.category,
            external_key="match-test",
            text="Poveži",
            difficulty=2,
            question_type=Question.Type.MATCHING,
            config={"pairs": [{"left": "Italija", "right": "Rim"}, {"left": "Avstrija", "right": "Dunaj"}]},
        )
        presentation = {
            "links": [
                {"left_id": "aa", "right_id": "bb", "left": "Italija", "right": "Rim"},
                {"left_id": "cc", "right_id": "dd", "left": "Avstrija", "right": "Dunaj"},
            ]
        }
        self.assertTrue(
            grade_answer(
                matching,
                {"pairs": [{"left_id": "aa", "right_id": "bb"}, {"left_id": "cc", "right_id": "dd"}]},
                presentation,
            )
        )
        self.assertFalse(
            grade_answer(
                matching,
                {"pairs": [{"left_id": "aa", "right_id": "dd"}, {"left_id": "cc", "right_id": "bb"}]},
                presentation,
            )
        )
        holder = GameQuestion.objects.create(
            game_session=GameSession.objects.get(),
            question=matching,
            order=8,
        )
        public = public_question(holder)
        self.assertNotIn("links", public)
        self.assertNotIn("links", json.dumps(public))

    def _option(self, message, correct):
        game_question = GameQuestion.objects.get(pk=message["question"]["game_question_id"])
        return game_question.question.options.get(is_correct=correct)

    def _answer(self, message, correct):
        option = self._option(message, correct)
        return submit_answer(
            self.member.id,
            {"game_question_id": message["question"]["game_question_id"], "option_id": option.id},
        )


class ApiFlowTests(TestCase):
    def setUp(self):
        category = Category.objects.create(name="Šport", slug="sport", order=1)
        for index in range(5):
            choice_question(category, f"api{index}", index + 1)

    def test_guest_creates_room_and_sees_categories(self):
        client = APIClient()
        categories = client.get("/api/categories/")
        self.assertEqual(categories.status_code, 200)
        self.assertEqual(categories.data["categories"][0]["question_count"], 5)
        guest = client.post("/api/auth/guest/", {"nickname": "Modri sokol"}, format="json")
        self.assertEqual(guest.status_code, 200)
        room = client.post(
            "/api/rooms/",
            {
                "nickname": "Modri sokol",
                "question_count": 5,
                "categories": ["sport"],
                "time_limit_seconds": 20,
            },
            format="json",
        )
        self.assertEqual(room.status_code, 200, room.data)
        self.assertEqual(room.data["status"], "waiting")
        self.assertEqual(room.data["max_players"], 1)
        self.assertEqual(room.data["settings"]["mode"], "millionaire")


class SocketTests(TransactionTestCase):
    def test_socket_hides_answer_until_submit(self):
        import asyncio

        category = Category.objects.create(name="Šport", slug="sport", order=1)
        for index in range(5):
            choice_question(category, f"ws{index}", index + 1)
        user = User.objects.create_user(
            username="ws@example.com",
            email="ws@example.com",
            password="zelo-dolgo-geslo",
            nickname="Ws",
        )
        room = create_solo_room(
            user,
            {"question_count": 5, "categories": ["sport"], "time_limit_seconds": 20},
        )

        from channels.db import database_sync_to_async

        @database_sync_to_async
        def wrong_option_id(game_question_id):
            game_question = GameQuestion.objects.get(pk=game_question_id)
            return game_question.question.options.get(is_correct=False).id

        async def play():
            communicator = WebsocketCommunicator(URLRouter(websocket_urlpatterns), f"/ws/game/{room.code}/")
            communicator.scope["user"] = user
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            waiting = await communicator.receive_json_from(timeout=3)
            self.assertEqual(waiting["phase"], "waiting")
            await communicator.send_json_to({"type": "start_game"})
            started = await communicator.receive_json_from(timeout=3)
            self.assertEqual(started["phase"], "question")
            self.assertNotIn("is_correct", json.dumps(started["question"]))
            wrong = await wrong_option_id(started["question"]["game_question_id"])
            await communicator.send_json_to(
                {
                    "type": "submit_answer",
                    "game_question_id": started["question"]["game_question_id"],
                    "option_id": wrong,
                }
            )
            result = await communicator.receive_json_from(timeout=3)
            finished = await communicator.receive_json_from(timeout=3)
            await communicator.disconnect()
            return result, finished

        result, finished = asyncio.run(play())
        self.assertEqual(result["type"], "answer_result")
        self.assertFalse(result["is_correct"])
        self.assertTrue(result["correct_option_ids"])
        self.assertEqual(finished["type"], "game_finished")
        self.assertEqual(finished["reason"], "wrong")


class HistoryTests(TestCase):
    def test_leaderboard_limit_and_private_result_detail(self):
        for index in range(11):
            GameResult.objects.create(
                nickname=f"Igralec {index}",
                mode="millionaire",
                score=100 + index,
                prize_reached=100,
                speed_bonus=0,
                correct_count=1,
                total_questions=5,
                is_guest=True,
                reason="wrong",
                room_code=f"C{index:02d}",
            )
        client = APIClient()
        board = client.get("/api/leaderboard/")
        self.assertEqual(board.status_code, 200)
        self.assertEqual(len(board.data["results"]), 10)
        self.assertEqual(board.data["total"], 11)
        self.assertIn("id", board.data["results"][0])
        everything = client.get("/api/leaderboard/?limit=all")
        self.assertEqual(len(everything.data["results"]), 11)
        found = client.get("/api/leaderboard/?q=Igralec 10&limit=100")
        self.assertEqual(found.data["results"][0]["nickname"], "Igralec 10")

        owner = User.objects.create_user(username="ana@example.com", email="ana@example.com", password="a1b2c3", nickname="Ana")
        category = Category.objects.create(name="Šport", slug="sport", order=1)
        question = choice_question(category, "hist", 1)
        room = Room.objects.create(code="HIST01", host=owner, status="finished", max_players=1, visibility="unlisted")
        member = RoomMember.objects.create(room=room, user=owner, nickname_in_room="Ana", is_host=True)
        session = GameSession.objects.create(
            room=room,
            mode="millionaire",
            status="finished",
            total_questions=1,
            time_limit_seconds=20,
            started_at=timezone.now(),
            finished_at=timezone.now(),
            state={"reason": "wrong", "score": 0},
        )
        game_question = GameQuestion.objects.create(game_session=session, question=question, order=0, started_at=timezone.now())
        wrong = question.options.get(is_correct=False)
        PlayerAnswer.objects.create(
            game_question=game_question,
            room_member=member,
            selected_option=wrong,
            answer_data={"option_id": wrong.id},
            is_correct=False,
            answered_at=timezone.now(),
            time_taken_ms=1000,
        )
        result = GameResult.objects.create(
            game_session=session,
            user=owner,
            nickname="Ana",
            mode="millionaire",
            score=0,
            prize_reached=0,
            speed_bonus=0,
            correct_count=0,
            total_questions=1,
            is_guest=False,
            reason="wrong",
            room_code="HIST01",
        )
        owner_client = APIClient()
        owner_client.force_login(owner)
        detail = owner_client.get(f"/api/results/{result.id}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["stages"][0]["given"], "Narobe")
        self.assertEqual(detail.data["stages"][0]["correct"], "Prav")
        stranger = APIClient()
        self.assertEqual(stranger.get(f"/api/results/{result.id}/").status_code, 404)
        mine = owner_client.get("/api/me/results/")
        self.assertEqual(mine.data["results"][0]["id"], result.id)
