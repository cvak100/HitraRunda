from datetime import timedelta

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User, create_guest
from game.models import GameResult
from rooms.models import Room, RoomMember


class AccountTests(TestCase):
    def test_register_login_and_guest(self):
        client = APIClient()
        created = client.post(
            "/api/auth/register/",
            {"email": "Ana@Example.com", "password": "zelo-dolgo-geslo", "nickname": "Ana"},
            format="json",
        )
        self.assertEqual(created.status_code, 200)
        self.assertEqual(created.data["user"]["email"], "ana@example.com")
        client.post("/api/auth/logout/", format="json")
        logged_in = client.post(
            "/api/auth/login/",
            {"email": "ana@example.com", "password": "zelo-dolgo-geslo"},
            format="json",
        )
        self.assertEqual(logged_in.status_code, 200)
        me = client.get("/api/auth/me/")
        self.assertEqual(me.data["user"]["nickname"], "Ana")

        other = APIClient()
        guest = other.post("/api/auth/guest/", {"nickname": "Hitri ris"}, format="json")
        self.assertTrue(guest.data["user"]["is_guest"])
        self.assertIsNone(guest.data["user"]["email"])

    def test_short_nickname_is_rejected(self):
        client = APIClient()
        response = client.post("/api/auth/guest/", {"nickname": "A"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_cleanup_removes_guest_and_keeps_score(self):
        guest = create_guest("Stari volk")
        User.objects.filter(pk=guest.pk).update(created_at=timezone.now() - timedelta(days=8))
        result = GameResult.objects.create(
            user=guest,
            nickname="Stari volk",
            mode="millionaire",
            score=500,
            prize_reached=500,
            speed_bonus=20,
            correct_count=4,
            total_questions=10,
            is_guest=True,
            reason="wrong",
            room_code="OLD123",
        )
        call_command("cleanup_guests")
        self.assertFalse(User.objects.filter(pk=guest.pk).exists())
        result.refresh_from_db()
        self.assertIsNone(result.user_id)
        self.assertEqual(result.nickname, "Stari volk")
        self.assertEqual(result.score, 500)

    def test_cleanup_keeps_guest_in_a_live_room(self):
        guest = create_guest("Svezi ris")
        User.objects.filter(pk=guest.pk).update(created_at=timezone.now() - timedelta(days=8))
        room = Room.objects.create(code="KEEP01", host=guest, status="playing", max_players=1, visibility="unlisted")
        RoomMember.objects.create(room=room, user=guest, nickname_in_room="Svezi ris", is_host=True)
        call_command("cleanup_guests")
        self.assertTrue(User.objects.filter(pk=guest.pk).exists())

    def test_user_can_change_nickname(self):
        client = APIClient()
        client.post("/api/auth/guest/", {"nickname": "Hitri ris"}, format="json")
        updated = client.patch("/api/auth/me/", {"nickname": "Nov ris"}, format="json")
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.data["user"]["nickname"], "Nov ris")
        rejected = client.patch("/api/auth/me/", {"nickname": "A"}, format="json")
        self.assertEqual(rejected.status_code, 400)

    def test_staff_grants_admin_only_to_registered_users(self):
        staff = User.objects.create_user(
            username="admin@example.com",
            email="admin@example.com",
            password="zelo-dolgo-geslo",
            nickname="Admin",
            is_staff=True,
        )
        player = User.objects.create_user(
            username="ana@example.com",
            email="ana@example.com",
            password="zelo-dolgo-geslo",
            nickname="Ana",
        )
        guest = create_guest("Hitri ris")
        client = APIClient()
        client.force_login(staff)
        listed = client.get("/api/admin/users/?q=Ana")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.data["users"][0]["email"], "ana@example.com")
        granted = client.post(f"/api/admin/users/{player.id}/", {"is_staff": True}, format="json")
        self.assertEqual(granted.status_code, 200)
        player.refresh_from_db()
        self.assertTrue(player.is_staff)
        guest_grant = client.post(f"/api/admin/users/{guest.id}/", {"is_staff": True}, format="json")
        self.assertEqual(guest_grant.status_code, 400)
        self_remove = client.post(f"/api/admin/users/{staff.id}/", {"is_staff": False}, format="json")
        self.assertEqual(self_remove.status_code, 400)
        staff.refresh_from_db()
        self.assertTrue(staff.is_staff)

    def test_password_can_be_four_characters(self):
        client = APIClient()
        created = client.post(
            "/api/auth/register/",
            {"email": "kratko@example.com", "password": "a1b2", "nickname": "Kratko"},
            format="json",
        )
        self.assertEqual(created.status_code, 200, created.data)
        short = client.post(
            "/api/auth/register/",
            {"email": "se@example.com", "password": "ab1", "nickname": "Se"},
            format="json",
        )
        self.assertEqual(short.status_code, 400)
