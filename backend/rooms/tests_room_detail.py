"""N5: GET /api/rooms/<code>/ za finished vrne 200 članu (ne 400 zaprta)."""

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from rooms.models import Room, RoomMember


class RoomDetailFinishedTests(TestCase):
    def setUp(self):
        self.host = APIClient()
        self.other = APIClient()
        self.host.post("/api/auth/guest/", {"nickname": "DetailHost"}, format="json")
        self.other.post("/api/auth/guest/", {"nickname": "DetailOther"}, format="json")
        self.host_user = User.objects.get(nickname="DetailHost")
        self.other_user = User.objects.get(nickname="DetailOther")

    def _room(self, status, *, with_host=True):
        room = Room.objects.create(
            code="FINDET",
            host=self.host_user,
            status=status,
            visibility="unlisted",
            max_players=4,
            settings={"mode": "hitrarunda"},
            finished_at=timezone.now() if status in {"finished", "closed"} else None,
        )
        if with_host:
            RoomMember.objects.create(
                room=room,
                user=self.host_user,
                nickname_in_room="DetailHost",
                is_host=True,
                is_ready=True,
            )
        return room

    def test_finished_member_gets_200(self):
        self._room("finished")
        resp = self.host.get("/api/rooms/FINDET/")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data.get("status"), "finished")
        self.assertEqual(resp.data.get("code"), "FINDET")

    def test_finished_non_member_gets_400(self):
        self._room("finished")
        resp = self.other.get("/api/rooms/FINDET/")
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn("zaprta", (resp.data.get("detail") or "").lower())

    def test_closed_member_gets_400(self):
        self._room("closed")
        resp = self.host.get("/api/rooms/FINDET/")
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn("zaprta", (resp.data.get("detail") or "").lower())
