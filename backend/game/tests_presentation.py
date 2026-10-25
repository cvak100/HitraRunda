from django.test import TestCase
from django.utils import timezone

from accounts.models import User
from game.engine import grade_answer
from game.models import GameQuestion, GameSession
from game.presentation import ensure_presentation, public_question
from game.replay import _correct
from questions.models import Category, Question, QuestionOption
from rooms.models import Room, RoomMember


class PresentationSnapshotTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="snap@example.com",
            email="snap@example.com",
            password="zelo-dolgo-geslo",
            nickname="Snap",
        )
        self.category = Category.objects.create(slug="sport", name="Šport", is_active=True)
        self.question = Question.objects.create(
            external_key="snap-1",
            category=self.category,
            question_type=Question.Type.MULTIPLE_CHOICE,
            difficulty=1,
            text="Prvotno besedilo?",
            is_active=True,
        )
        self.correct = QuestionOption.objects.create(
            question=self.question, text="Pravilno A", is_correct=True, order=0
        )
        QuestionOption.objects.create(question=self.question, text="Napačno B", is_correct=False, order=1)
        room = Room.objects.create(
            code="SNAP01", host=self.user, status="playing", max_players=1, visibility="unlisted"
        )
        RoomMember.objects.create(room=room, user=self.user, nickname_in_room="Snap", is_host=True)
        self.session = GameSession.objects.create(
            room=room,
            mode="hitrarunda",
            status="finished",
            total_questions=1,
            time_limit_seconds=20,
            started_at=timezone.now(),
            finished_at=timezone.now(),
        )
        self.gq = GameQuestion.objects.create(
            game_session=self.session, question=self.question, order=0, started_at=timezone.now()
        )

    def test_replay_keeps_frozen_text_after_admin_edit(self):
        presentation = ensure_presentation(self.gq)
        self.assertEqual(presentation["v"], 2)
        self.assertEqual(presentation["text"], "Prvotno besedilo?")
        public = public_question(self.gq)
        self.assertEqual(public["text"], "Prvotno besedilo?")
        self.assertTrue(grade_answer(self.question, {"option_id": self.correct.id}, presentation))

        self.question.text = "Spremenjeno po igri"
        self.question.save(update_fields=["text"])
        self.correct.text = "Drugačen A"
        self.correct.is_correct = False
        self.correct.save(update_fields=["text", "is_correct"])

        self.gq.refresh_from_db()
        again = ensure_presentation(self.gq)
        self.assertEqual(again["text"], "Prvotno besedilo?")
        self.assertEqual(public_question(self.gq)["text"], "Prvotno besedilo?")
        self.assertIn("Pravilno A", _correct(self.gq, again))
        # Ocenjevanje še vedno uporablja zamrznjen is_correct.
        self.assertTrue(grade_answer(self.question, {"option_id": self.correct.id}, again))
