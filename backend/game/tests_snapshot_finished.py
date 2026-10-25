"""N1: po koncu igre snapshot vrne finish, ne lobby/waiting (več sej na sobo)."""

from django.test import TestCase
from rest_framework.test import APIClient

from game.dirka import snapshot_dirka, start_dirka
from game.engine import snapshot, start_game, submit_answer
from game.modes import MODE_DIRKA, MODE_HITRARUNDA, MODE_MULTIPLAYER
from game.multiplayer import next_multiplayer, snapshot_multiplayer, start_multiplayer
from game.seed_content import ensure_bots
from questions.models import Category, Question, QuestionOption
from rooms.models import Room, RoomMember
from rooms.services import rematch_room


def make_questions(category, count=12):
    for index in range(count):
        question = Question.objects.create(
            external_key=f"snap-{category.slug}-{index}",
            category=category,
            question_type=Question.Type.MULTIPLE_CHOICE,
            difficulty=min(5, 1 + index // 3),
            text=f"Snap {index}",
            is_active=True,
        )
        QuestionOption.objects.create(question=question, text="A", is_correct=True, order=0)
        QuestionOption.objects.create(question=question, text="B", is_correct=False, order=1)


class SnapshotFinishedTests(TestCase):
    def setUp(self):
        ensure_bots()
        self.category = Category.objects.create(slug="snap", name="Snap", is_active=True)
        make_questions(self.category, 12)
        self.host = APIClient()
        self.guest = APIClient()
        self.host.post("/api/auth/guest/", {"nickname": "SnapHost"}, format="json")
        self.guest.post("/api/auth/guest/", {"nickname": "SnapGuest"}, format="json")

    def _finish_multiplayer(self):
        created = self.host.post(
            "/api/rooms/",
            {
                "mode": MODE_MULTIPLAYER,
                "nickname": "SnapHost",
                "visibility": "public",
                "max_players": 4,
                "bot_count": 1,
                "question_count": 5,
                "time_limit_seconds": 30,
                "categories": ["snap"],
            },
            format="json",
        )
        self.assertEqual(created.status_code, 200, created.data)
        code = created.data["code"]
        self.guest.post(f"/api/rooms/{code}/join/", {"nickname": "SnapGuest"}, format="json")
        self.host.post(f"/api/rooms/{code}/ready/", {"ready": True}, format="json")
        self.guest.post(f"/api/rooms/{code}/ready/", {"ready": True}, format="json")
        host_member = RoomMember.objects.get(room__code=code, is_host=True)
        start_multiplayer(str(host_member.id))
        from game.models import GameSession

        session = GameSession.objects.get(room__code=code, status="active")
        members = list(RoomMember.objects.filter(room__code=code, left_at__isnull=True))
        for order in range(session.total_questions):
            gq = session.game_questions.get(order=order)
            correct = gq.question.options.get(is_correct=True)
            for member in members:
                submit_answer(
                    str(member.id),
                    {"game_question_id": str(gq.id), "option_id": correct.id},
                )
            next_multiplayer(str(host_member.id))
        session.refresh_from_db()
        self.assertEqual(session.status, "finished")
        self.assertEqual(Room.objects.get(code=code).status, "finished")
        return code, host_member

    def test_multiplayer_snapshot_after_finish_is_finished_not_lobby(self):
        code, host_member = self._finish_multiplayer()
        payload = snapshot_multiplayer(str(host_member.id))
        self.assertEqual(payload.get("phase"), "finished", payload)
        self.assertNotEqual(payload.get("phase"), "lobby")
        # Rematch: waiting → spet lobby (ne stari finish).
        rematch_room(host_member.user, code)
        lobby = snapshot_multiplayer(str(host_member.id))
        self.assertEqual(lobby.get("phase"), "lobby", lobby)

    def test_engine_snapshot_solo_after_finish(self):
        created = self.host.post(
            "/api/rooms/",
            {
                "mode": MODE_HITRARUNDA,
                "nickname": "SnapHost",
                "visibility": "unlisted",
                "question_count": 5,
                "time_limit_seconds": 30,
                "categories": ["snap"],
            },
            format="json",
        )
        self.assertEqual(created.status_code, 200, created.data)
        code = created.data["code"]
        host_member = RoomMember.objects.get(room__code=code, is_host=True)
        start_game(str(host_member.id))
        from game.models import GameSession
        from game.engine import next_question

        session = GameSession.objects.get(room__code=code, status="active")
        for order in range(session.total_questions):
            gq = session.game_questions.get(order=order)
            correct = gq.question.options.get(is_correct=True)
            submit_answer(
                str(host_member.id),
                {"game_question_id": str(gq.id), "option_id": correct.id},
            )
            session.refresh_from_db()
            if session.status == "finished":
                break
            next_question(str(host_member.id))
        session.refresh_from_db()
        self.assertEqual(session.status, "finished")
        payload = snapshot(str(host_member.id))
        self.assertEqual(payload.get("phase"), "finished", payload)
        self.assertNotEqual(payload.get("phase"), "waiting")

    def test_dirka_snapshot_after_finish(self):
        created = self.host.post(
            "/api/rooms/",
            {
                "mode": MODE_DIRKA,
                "nickname": "SnapHost",
                "visibility": "public",
                "max_players": 4,
                "bot_count": 1,
                "question_count": 5,
                "time_limit_seconds": 30,
                "categories": ["snap"],
            },
            format="json",
        )
        self.assertEqual(created.status_code, 200, created.data)
        code = created.data["code"]
        self.guest.post(f"/api/rooms/{code}/join/", {"nickname": "SnapGuest"}, format="json")
        self.host.post(f"/api/rooms/{code}/ready/", {"ready": True}, format="json")
        self.guest.post(f"/api/rooms/{code}/ready/", {"ready": True}, format="json")
        host_member = RoomMember.objects.get(room__code=code, is_host=True)
        start_dirka(str(host_member.id))
        from game.models import GameSession
        from game.dirka import next_dirka

        session = GameSession.objects.get(room__code=code, status="active")
        members = list(RoomMember.objects.filter(room__code=code, left_at__isnull=True))
        for order in range(session.total_questions):
            gq = session.game_questions.get(order=order)
            correct = gq.question.options.get(is_correct=True)
            for member in members:
                submit_answer(
                    str(member.id),
                    {"game_question_id": str(gq.id), "option_id": correct.id},
                )
            next_dirka(str(host_member.id))
        session.refresh_from_db()
        self.assertEqual(session.status, "finished")
        payload = snapshot_dirka(str(host_member.id))
        self.assertEqual(payload.get("phase"), "finished", payload)
