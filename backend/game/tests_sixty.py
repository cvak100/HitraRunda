from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from game.engine import submit_answer
from game.modes import (
    MODE_60_SEKUND,
    SIXTY_CORRECT_BONUS,
    SIXTY_SKIP_PENALTY,
    SIXTY_WRONG_PENALTY,
)
from game.models import GameResult, GameSession
from game.sixty import _adjust_clock, _difficulty_band, start_sixty
from questions.models import Category, Question, QuestionOption
from rooms.models import RoomMember


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
    return question


class SixtyModeTests(TestCase):
    def setUp(self):
        self.category = Category.objects.create(slug="sport", name="Šport", is_active=True)
        for index in range(20):
            make_mc(self.category, f"s60-{index}", difficulty=1 + (index % 5))
        self.client = APIClient()
        self.client.post("/api/auth/guest/", {"nickname": "Ura"}, format="json")

    def _start(self, skip_limit=5, profile="normal"):
        created = self.client.post(
            "/api/rooms/",
            {
                "mode": MODE_60_SEKUND,
                "nickname": "Ura",
                "categories": ["sport"],
                "skip_limit": skip_limit,
                "difficulty_profile": profile,
            },
            format="json",
        )
        self.assertEqual(created.status_code, 200, created.data)
        member = RoomMember.objects.get(room__code=created.data["code"], is_host=True)
        payloads = start_sixty(member.id)
        self.assertEqual(payloads[0]["phase"], "question")
        self.assertEqual(payloads[0]["mode"], MODE_60_SEKUND)
        return member, payloads[0]

    def test_correct_wrong_skip_clock(self):
        member, first = self._start(skip_limit=3)
        session = GameSession.objects.get(room__code=member.room.code)
        gq_id = first["question"]["game_question_id"]
        correct = session.game_questions.get(pk=gq_id).question.options.get(is_correct=True)
        before = session.state["clock_ends_at"]
        ok = submit_answer(member.id, {"game_question_id": gq_id, "option_id": correct.id})
        self.assertEqual(ok[0]["feedback"]["time_delta"], SIXTY_CORRECT_BONUS)
        self.assertTrue(ok[0]["feedback"]["is_correct"])
        session.refresh_from_db()
        self.assertEqual(session.state["correct_count"], 1)
        self.assertNotEqual(session.state["clock_ends_at"], before)

        gq2 = ok[0]["question"]["game_question_id"]
        wrong = session.game_questions.get(pk=gq2).question.options.filter(is_correct=False).first()
        bad = submit_answer(member.id, {"game_question_id": gq2, "option_id": wrong.id})
        self.assertEqual(bad[0]["feedback"]["time_delta"], -SIXTY_WRONG_PENALTY)

        gq3 = bad[0]["question"]["game_question_id"]
        skipped = submit_answer(member.id, {"game_question_id": gq3, "skip": True})
        self.assertEqual(skipped[0]["feedback"]["time_delta"], -SIXTY_SKIP_PENALTY)
        self.assertTrue(skipped[0]["feedback"]["skipped"])
        self.assertEqual(skipped[0]["skips_left"], 2)

    def test_unlimited_skips(self):
        member, first = self._start(skip_limit=None)
        self.assertIsNone(first["skips_left"])
        gq = first["question"]["game_question_id"]
        out = submit_answer(member.id, {"game_question_id": gq, "skip": True})
        self.assertIsNone(out[0]["skips_left"])

    def test_clock_cap_and_difficulty_bands(self):
        now = timezone.now()
        capped = _adjust_clock(now, 500, 180, now)
        self.assertLessEqual((capped - now).total_seconds(), 180)
        self.assertEqual(_difficulty_band("normal", 10), (1, 2))
        self.assertEqual(_difficulty_band("normal", 100), (4, 5))
        self.assertEqual(_difficulty_band("normal", 200), (5, 5))

    def test_finish_writes_result(self):
        member, first = self._start()
        session = GameSession.objects.get(room__code=member.room.code)
        # Potisni clock v preteklost.
        state = dict(session.state or {})
        state["clock_ends_at"] = (timezone.now() - timedelta(seconds=1)).isoformat()
        session.state = state
        session.save(update_fields=["state"])
        out = submit_answer(
            member.id,
            {"game_question_id": first["question"]["game_question_id"], "timeout": True},
        )
        self.assertEqual(out[0]["phase"], "finished")
        result = GameResult.objects.get(mode=MODE_60_SEKUND, room_code=member.room.code)
        self.assertEqual(result.score, result.correct_count)
        self.assertIsNotNone(result.duration_ms)
