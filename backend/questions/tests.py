import json

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from game.models import GameQuestion, GameSession, PlayerAnswer
from questions.importer import export_payload, import_payload
from questions.models import Category, Question, QuestionOption, QuestionReport
from rooms.models import Room, RoomMember

EXPECTED_SEED_COUNT = 14536


class ImportTests(TestCase):
    def test_seed_is_idempotent(self):
        call_command("seed_questions")
        call_command("seed_questions")
        self.assertEqual(Question.objects.count(), EXPECTED_SEED_COUNT)

    def test_update_keeps_option_ids_and_count(self):
        call_command("seed_questions")
        question = Question.objects.get(external_key="sport-d1-1")
        option_id = question.options.order_by("order").first().id
        payload = export_payload()
        target = next(item for item in payload["questions"] if item["key"] == "sport-d1-1")
        target["text"] = "Spremenjeno besedilo"
        report = import_payload(json.dumps(payload, ensure_ascii=False))
        self.assertEqual(report["errors"], [])
        question.refresh_from_db()
        self.assertEqual(question.text, "Spremenjeno besedilo")
        self.assertEqual(question.options.order_by("order").first().id, option_id)
        self.assertEqual(Question.objects.count(), EXPECTED_SEED_COUNT)

    def test_export_keeps_slider_secret_on_the_server_file(self):
        # Novi seed nima sliderjev — fixture v testu.
        Category.objects.get_or_create(slug="zemljepis", defaults={"name": "Zemljepis", "order": 2})
        report = import_payload(
            json.dumps(
                {
                    "version": 1,
                    "questions": [
                        {
                            "key": "zemljepis-slider-test",
                            "category": "zemljepis",
                            "question_type": "slider",
                            "difficulty": 2,
                            "text": "Koliko m je Triglav?",
                            "slider": {
                                "min": 2000,
                                "max": 3000,
                                "step": 1,
                                "correct": 2864,
                                "tolerance": 50,
                            },
                        }
                    ],
                }
            )
        )
        self.assertEqual(report["errors"], [])
        payload = export_payload()
        slider = next(item for item in payload["questions"] if item["key"] == "zemljepis-slider-test")
        self.assertEqual(slider["slider"]["correct"], 2864)
        self.assertEqual(slider["slider"]["tolerance"], 50)

    def test_invalid_file_writes_nothing(self):
        report = import_payload(
            json.dumps(
                {
                    "version": 1,
                    "questions": [
                        {
                            "key": "sport-ok",
                            "category": "sport",
                            "question_type": "true_false",
                            "difficulty": 1,
                            "text": "Test",
                            "options": [
                                {"text": "Drži", "correct": True},
                                {"text": "Ne drži", "correct": False},
                            ],
                        },
                        {"key": "zgodovina-1", "category": "zgodovina"},
                    ],
                }
            )
        )
        self.assertTrue(report["errors"])
        self.assertEqual(Question.objects.count(), 0)
        self.assertEqual(report["created"], 0)

    def test_import_accepts_zivali_with_sumik_and_stores_zivali(self):
        report = import_payload(
            json.dumps(
                [
                    {
                        "key": "živali-d1-test",
                        "category": "živali",
                        "question_type": "multiple_choice",
                        "difficulty": 1,
                        "text": "Katera žival mija?",
                        "explanation": "Mačka.",
                        "options": [
                            {"text": "Mačka", "correct": True},
                            {"text": "Pes", "correct": False},
                            {"text": "Krava", "correct": False},
                            {"text": "Kura", "correct": False},
                        ],
                    }
                ],
                ensure_ascii=False,
            )
        )
        self.assertEqual(report["errors"], [])
        self.assertEqual(report["created"], 1)
        question = Question.objects.get(external_key="živali-d1-test")
        self.assertEqual(question.category.slug, "zivali")
        self.assertEqual(question.category.name, "Živali")

    def test_seed_preserves_admin_deactivation(self):
        call_command("seed_questions")
        question = Question.objects.get(external_key="sport-d1-1")
        question.is_active = False
        question.save(update_fields=["is_active"])
        call_command("seed_questions")
        question.refresh_from_db()
        self.assertFalse(question.is_active)

    def test_seed_only_new_skips_existing(self):
        call_command("seed_questions", only_new=True)
        self.assertEqual(Question.objects.count(), EXPECTED_SEED_COUNT)
        question = Question.objects.get(external_key="sport-d1-1")
        question.text = "Admin popravek"
        question.save(update_fields=["text"])
        call_command("seed_questions", only_new=True)
        question.refresh_from_db()
        self.assertEqual(question.text, "Admin popravek")
        self.assertEqual(Question.objects.count(), EXPECTED_SEED_COUNT)


class ReportTests(TestCase):
    def setUp(self):
        self.player = User.objects.create_user(username="igralec@example.com", email="igralec@example.com", password="zelo-dolgo-geslo", nickname="Igralec")
        self.staff = User.objects.create_user(username="admin@example.com", email="admin@example.com", password="zelo-dolgo-geslo", nickname="Admin", is_staff=True)
        self.question, self.game_question = self._played(self.player, "rpt-ena", "RPT001")

    def _played(self, user, key, code):
        category, _ = Category.objects.get_or_create(name="Šport", slug="sport")
        question = Question.objects.create(
            category=category,
            external_key=key,
            text="Koliko igralcev ima ekipa?",
            difficulty=1,
            question_type=Question.Type.MULTIPLE_CHOICE,
            explanation="Enajst.",
        )
        QuestionOption.objects.create(question=question, text="11", is_correct=True, order=0)
        QuestionOption.objects.create(question=question, text="10", is_correct=False, order=1)
        room = Room.objects.create(code=code, host=user, status="playing", max_players=1, visibility="unlisted")
        member = RoomMember.objects.create(room=room, user=user, nickname_in_room=user.nickname, is_host=True)
        session = GameSession.objects.create(
            room=room,
            mode="hitrarunda",
            status="active",
            total_questions=1,
            time_limit_seconds=20,
            started_at=timezone.now(),
        )
        game_question = GameQuestion.objects.create(game_session=session, question=question, order=0, started_at=timezone.now())
        PlayerAnswer.objects.create(game_question=game_question, room_member=member, is_correct=True, answered_at=timezone.now())
        return question, game_question

    def test_player_reports_and_repeat_updates_the_note(self):
        client = APIClient()
        client.force_login(self.player)
        created = client.post("/api/reports/", {"game_question_id": self.game_question.id, "note": "Odgovor je 11, ne 10."}, format="json")
        self.assertEqual(created.status_code, 200)
        again = client.post("/api/reports/", {"game_question_id": str(self.game_question.id), "note": "Še vedno narobe."}, format="json")
        self.assertEqual(again.status_code, 200)
        self.assertEqual(QuestionReport.objects.count(), 1)
        self.assertEqual(QuestionReport.objects.get().note, "Še vedno narobe.")

    def test_stranger_cannot_report(self):
        other = User.objects.create_user(username="drug@example.com", email="drug@example.com", password="zelo-dolgo-geslo", nickname="Drug")
        client = APIClient()
        client.force_login(other)
        response = client.post("/api/reports/", {"game_question_id": self.game_question.id, "note": "Ni moje."}, format="json")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(QuestionReport.objects.count(), 0)

    def test_staff_reviews_and_delete_withdraws_a_used_question(self):
        player = APIClient()
        player.force_login(self.player)
        player.post("/api/reports/", {"game_question_id": self.game_question.id, "note": "Napačen odgovor."}, format="json")
        guest = APIClient()
        self.assertEqual(guest.get("/api/admin/questions/").status_code, 403)
        self.assertEqual(guest.get("/api/admin/summary/").status_code, 403)

        staff = APIClient()
        staff.force_login(self.staff)
        summary = staff.get("/api/admin/summary/")
        self.assertEqual(summary.status_code, 200)
        self.assertEqual(summary.data["open_reports"], 1)
        self.assertGreaterEqual(summary.data["active_questions"], 1)
        self.assertIn("recent_reports", summary.data)
        self.assertIn("recent_sessions", summary.data)
        self.assertIn("attention", summary.data)
        self.assertEqual(summary.data["attention"]["open_reports"], 1)

        listed = staff.get("/api/admin/reports/")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.data["reports"][0]["question"]["options"][0]["correct"], True)
        report_id = listed.data["reports"][0]["id"]

        removed = staff.delete(f"/api/admin/questions/{self.question.id}/")
        self.assertEqual(removed.status_code, 200)
        self.assertTrue(removed.data["deactivated"])
        self.question.refresh_from_db()
        self.assertFalse(self.question.is_active)
        self.assertEqual(QuestionReport.objects.get(pk=report_id).status, QuestionReport.Status.RESOLVED)
        self.assertEqual(staff.get("/api/admin/reports/").data["reports"], [])

    def test_staff_deletes_an_unused_question_and_can_dismiss(self):
        spare = Question.objects.create(
            category=self.question.category,
            external_key="rpt-dva",
            text="Neuporabljeno",
            difficulty=1,
            question_type=Question.Type.TRUE_FALSE,
        )
        report = QuestionReport.objects.create(question=spare, user=self.player, nickname="Igralec", note="Ni res.")
        staff = APIClient()
        staff.force_login(self.staff)
        dismissed = staff.post(f"/api/admin/reports/{report.id}/", {"status": "dismissed"}, format="json")
        self.assertEqual(dismissed.status_code, 200)
        report.refresh_from_db()
        self.assertEqual(report.status, QuestionReport.Status.DISMISSED)
        removed = staff.delete(f"/api/admin/questions/{spare.id}/")
        self.assertTrue(removed.data["deleted"])
        self.assertFalse(Question.objects.filter(pk=spare.id).exists())

    def test_withdrawn_filter_lists_only_inactive_questions(self):
        self.question.is_active = False
        self.question.save(update_fields=["is_active"])
        staff = APIClient()
        staff.force_login(self.staff)
        withdrawn = staff.get("/api/admin/questions/?status=withdrawn")
        self.assertEqual(withdrawn.status_code, 200)
        self.assertEqual([item["id"] for item in withdrawn.data["questions"]], [self.question.id])
        active = staff.get("/api/admin/questions/?status=active")
        self.assertNotIn(self.question.id, [item["id"] for item in active.data["questions"]])

    def test_staff_deactivates_all_active_questions(self):
        spare = Question.objects.create(
            category=self.question.category,
            external_key="rpt-bulk",
            text="Še eno aktivno",
            difficulty=1,
            question_type=Question.Type.TRUE_FALSE,
            is_active=True,
        )
        staff = APIClient()
        staff.force_login(self.staff)
        guest = APIClient()
        self.assertEqual(guest.post("/api/admin/questions/deactivate-active/", {}, format="json").status_code, 403)

        result = staff.post("/api/admin/questions/deactivate-active/", {}, format="json")
        self.assertEqual(result.status_code, 200, result.data)
        self.assertGreaterEqual(result.data["deactivated"], 2)
        self.assertEqual(result.data["active"], 0)
        self.question.refresh_from_db()
        spare.refresh_from_db()
        self.assertFalse(self.question.is_active)
        self.assertFalse(spare.is_active)
