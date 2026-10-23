from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.staff import StaffOnly
from rooms.models import Room
from game.engine import GameError
from rooms.services import admin_kick_member, close_room, close_stale_rooms, lobby_payload


def admin_room_payload(room):
    payload = lobby_payload(room, viewer=None)
    payload.update(
        {
            "id": str(room.id),
            "created_at": room.created_at.isoformat() if room.created_at else None,
            "last_activity": room.last_activity.isoformat() if room.last_activity else None,
            "started_at": room.started_at.isoformat() if room.started_at else None,
            "finished_at": room.finished_at.isoformat() if room.finished_at else None,
            "host_nickname": room.host.nickname if room.host_id else "",
            "close_reason": (room.settings or {}).get("close_reason") or "",
        }
    )
    return payload


class AdminRoomListView(APIView):
    permission_classes = [StaffOnly]

    def get(self, request):
        close_stale_rooms()
        status = str(request.query_params.get("status") or "").strip()
        rooms = Room.objects.select_related("host").order_by("-last_activity", "-created_at")
        if status:
            rooms = rooms.filter(status=status)
        else:
            rooms = rooms.filter(status__in=["waiting", "playing", "closed", "finished"])[:80]
        return Response(
            {
                "rooms": [admin_room_payload(room) for room in rooms[:80]],
                "server_now": timezone.now().isoformat(),
            }
        )


class AdminRoomCloseView(APIView):
    permission_classes = [StaffOnly]

    def post(self, request, code):
        room = get_object_or_404(Room, code=code.upper())
        if room.status in {"finished", "closed"}:
            return Response({"detail": "Soba je že zaprta.", "room": admin_room_payload(room)}, status=400)
        close_room(room, reason="admin")
        return Response({"detail": "Soba je zaprta.", "room": admin_room_payload(room)})


class AdminRoomKickView(APIView):
    permission_classes = [StaffOnly]

    def post(self, request, code):
        room = get_object_or_404(Room.objects.prefetch_related("members"), code=code.upper())
        member_id = request.data.get("member_id")
        if not member_id:
            return Response({"detail": "Manjka member_id."}, status=400)
        try:
            member = admin_kick_member(room, member_id)
        except GameError as exc:
            return Response({"detail": str(exc)}, status=400)
        return Response(
            {
                "detail": f"Igralec {member.nickname_in_room} je odstranjen.",
                "room": admin_room_payload(room),
            }
        )
