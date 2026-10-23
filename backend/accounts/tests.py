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
            mode="hitrarunda",
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

    def test_staff_can_run_cleanup_from_api(self):
        guest = create_guest("Stari volk")
        User.objects.filter(pk=guest.pk).update(created_at=timezone.now() - timedelta(days=8))
        staff = User.objects.create_user(
            username="admin@example.com",
            email="admin@example.com",
            password="zelo-dolgo-geslo",
            nickname="Admin",
            is_staff=True,
        )
        stranger = APIClient()
        self.assertEqual(stranger.post("/api/admin/actions/cleanup-guests/").status_code, 403)
        client = APIClient()
        client.force_login(staff)
        cleaned = client.post("/api/admin/actions/cleanup-guests/")
        self.assertEqual(cleaned.status_code, 200)
        self.assertEqual(cleaned.data["deleted"], 1)
        self.assertFalse(User.objects.filter(pk=guest.pk).exists())

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

    def test_guest_register_keeps_same_user_and_results(self):
        client = APIClient()
        guest = client.post("/api/auth/guest/", {"nickname": "Gost volk"}, format="json")
        self.assertEqual(guest.status_code, 200)
        guest_id = guest.data["user"]["id"]
        GameResult.objects.create(
            user_id=guest_id,
            nickname="Gost volk",
            mode="hitrarunda",
            score=777,
            correct_count=7,
            total_questions=10,
            is_guest=True,
        )
        converted = client.post(
            "/api/auth/register/",
            {"email": "gost@example.com", "password": "dolgo-geslo-1", "nickname": "Gost volk"},
            format="json",
        )
        self.assertEqual(converted.status_code, 200, converted.data)
        self.assertTrue(converted.data.get("converted"))
        self.assertEqual(converted.data["user"]["id"], guest_id)
        self.assertFalse(converted.data["user"]["is_guest"])
        result = GameResult.objects.get(user_id=guest_id)
        self.assertEqual(result.score, 777)
        self.assertFalse(result.is_guest)

    def test_password_change_and_reset(self):
        client = APIClient()
        client.post(
            "/api/auth/register/",
            {"email": "geslo@example.com", "password": "staro-geslo", "nickname": "Geslar"},
            format="json",
        )
        changed = client.post(
            "/api/auth/password/",
            {"current_password": "staro-geslo", "new_password": "novo-geslo-1"},
            format="json",
        )
        self.assertEqual(changed.status_code, 200, changed.data)
        client.post("/api/auth/logout/", format="json")
        bad = client.post(
            "/api/auth/login/",
            {"email": "geslo@example.com", "password": "staro-geslo"},
            format="json",
        )
        self.assertEqual(bad.status_code, 400)
        ok = client.post(
            "/api/auth/login/",
            {"email": "geslo@example.com", "password": "novo-geslo-1"},
            format="json",
        )
        self.assertEqual(ok.status_code, 200)

        reset = client.post("/api/auth/password-reset/", {"email": "geslo@example.com"}, format="json")
        self.assertEqual(reset.status_code, 200)
        self.assertIn("debug_link", reset.data)
        from urllib.parse import parse_qs, urlparse

        query = parse_qs(urlparse(reset.data["debug_link"]).query)
        confirm = client.post(
            "/api/auth/password-reset/confirm/",
            {"uid": query["uid"][0], "token": query["token"][0], "password": "reset-geslo-9"},
            format="json",
        )
        self.assertEqual(confirm.status_code, 200, confirm.data)
        client.post("/api/auth/logout/", format="json")
        after = client.post(
            "/api/auth/login/",
            {"email": "geslo@example.com", "password": "reset-geslo-9"},
            format="json",
        )
        self.assertEqual(after.status_code, 200)

    def test_me_patch_color_and_avatar(self):
        client = APIClient()
        client.post(
            "/api/auth/register/",
            {"email": "barva@example.com", "password": "geslo1234", "nickname": "Barva"},
            format="json",
        )
        patched = client.patch(
            "/api/auth/me/",
            {"preferred_color": "#85c1e9", "avatar": "ris"},
            format="json",
        )
        self.assertEqual(patched.status_code, 200, patched.data)
        self.assertEqual(patched.data["user"]["preferred_color"], "#85c1e9")
        self.assertEqual(patched.data["user"]["avatar"], "ris")
        bad = client.patch("/api/auth/me/", {"preferred_color": "red"}, format="json")
        self.assertEqual(bad.status_code, 400)
        bad_avatar = client.patch("/api/auth/me/", {"avatar": "https://x.com/a.png"}, format="json")
        self.assertEqual(bad_avatar.status_code, 400)
