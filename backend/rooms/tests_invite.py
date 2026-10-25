from django.test import TestCase
from django.utils import timezone

from accounts.models import User, create_guest
from game.engine import GameError
from rooms.models import Room, RoomMember
from rooms.services import invite_user, join_room


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
            visibility="private",
            settings={"mode": "dirka", "target_score": 100, "safe_every": 5},
        )
        room.set_password("skrivnost")
        room.save(update_fields=["password"])
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

    def test_invite_cleared_after_join(self):
        host, room = self._host_room()
        friend = User.objects.create_user(
            username="friend@example.com",
            email="friend@example.com",
            password="zelo-dolgo-geslo",
            nickname="Povabljeni",
        )
        invite_user(host, room.code, {"nickname": "Povabljeni"})
        room.refresh_from_db()
        self.assertEqual(len((room.settings or {}).get("invites") or []), 1)
        # Zasebna soba: vstop samo s povabilom (brez gesla).
        join_room(friend, room.code, {"nickname": "Povabljeni"})
        room.refresh_from_db()
        self.assertEqual((room.settings or {}).get("invites") or [], [])
        # Po porabi povabila brez gesla ne more več (npr. po leave).
        RoomMember.objects.filter(room=room, user=friend).update(left_at=timezone.now())
        with self.assertRaises(GameError):
            join_room(friend, room.code, {"nickname": "Povabljeni"})

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
