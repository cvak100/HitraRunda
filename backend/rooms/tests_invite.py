from django.test import TestCase

from accounts.models import User, create_guest
from rooms.models import Room, RoomMember
from rooms.services import invite_user


class InviteTests(TestCase):
    def _host_room(self):
        host = User.objects.create_user(
            username="host@example.com",
            email="host@example.com",
            password="zelo-dolgo-geslo",
            nickname="HostNick",
        )
        room = Room.objects.create(
            code="INV001",
            host=host,
            status="waiting",
            max_players=4,
            visibility="public",
            settings={"mode": "dirka", "target_score": 100, "safe_every": 5},
        )
        RoomMember.objects.create(room=room, user=host, nickname_in_room="HostNick", is_host=True)
        return host, room

    def test_invite_by_nickname_does_not_500(self):
        host, room = self._host_room()
        User.objects.create_user(
            username="friend@example.com",
            email="friend@example.com",
            password="zelo-dolgo-geslo",
            nickname="Povabljeni",
        )
        invite_user(host, room.code, {"nickname": "Povabljeni"})
        room.refresh_from_db()
        invites = (room.settings or {}).get("invites") or []
        self.assertEqual(len(invites), 1)
        # Neznan vzdevek — tiho (brez enumeracije), soba nespremenjena.
        invite_user(host, room.code, {"nickname": "NeObstaja"})
        room.refresh_from_db()
        self.assertEqual(len((room.settings or {}).get("invites") or []), 1)

    def test_invite_does_not_match_email(self):
        host, room = self._host_room()
        User.objects.create_user(
            username="friend@example.com",
            email="friend@example.com",
            password="zelo-dolgo-geslo",
            nickname="Povabljeni",
        )
        invite_user(host, room.code, {"nickname": "friend@example.com"})
        room.refresh_from_db()
        self.assertEqual((room.settings or {}).get("invites") or [], [])

    def test_invite_skips_guest_accounts(self):
        host, room = self._host_room()
        create_guest("SamoGost")
        invite_user(host, room.code, {"nickname": "SamoGost"})
        room.refresh_from_db()
        self.assertEqual((room.settings or {}).get("invites") or [], [])
