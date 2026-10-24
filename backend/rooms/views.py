from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.nicknames import NicknameError
from game.engine import GameError
from rooms.models import Room
from rooms.services import (
    close_stale_rooms,
    create_multiplayer_room,
    create_solo_room,
    host_kick_member,
    invite_user,
    join_room,
    leave_room,
    list_invites,
    list_public_rooms,
    notify_room_lobby,
    quick_join,
    refresh_can_start,
    room_payload,
    set_ready,
    touch_room,
    update_room_settings,
)


class RoomCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        raw = request.data if isinstance(request.data, dict) else {}
        try:
            if raw.get("mode") in {"multiplayer", "dirka"}:
                room = create_multiplayer_room(request.user, raw)
            else:
                room = create_solo_room(request.user, raw)
        except (GameError, NicknameError) as exc:
            return Response({"detail": exc.message}, status=400)
        return Response(room_payload(room, viewer=request.user))


class RoomQuickJoinView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            room, created = quick_join(request.user, request.data)
        except (GameError, NicknameError) as exc:
            return Response({"detail": exc.message}, status=400)
        payload = room_payload(room, viewer=request.user)
        payload["created"] = created
        return Response(payload)


class RoomJoinView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, code):
        try:
            room = join_room(request.user, code, request.data)
        except (GameError, NicknameError) as exc:
            return Response({"detail": exc.message}, status=400)
        return Response(room_payload(room, viewer=request.user))


class RoomDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, code):
        close_stale_rooms()
        room = Room.objects.filter(code=code.upper()).first()
        if room is None:
            return Response({"detail": "Soba ne obstaja."}, status=404)
        if room.status in {"closed", "finished"}:
            return Response({"detail": "Soba je zaprta."}, status=400)
        member = room.members.filter(user=request.user, left_at__isnull=True).first()
        if member is None and room.visibility == "private":
            return Response({"detail": "Soba ne obstaja."}, status=404)
        if member is None and room.visibility != "public":
            # unlisted: allow detail only if member; public can preview
            return Response({"detail": "Nisi v sobi."}, status=403)
        if member is not None:
            touch_room(room)
        return Response(room_payload(room, viewer=request.user if member else None))

    def patch(self, request, code):
        try:
            room = update_room_settings(request.user, code, request.data)
        except GameError as exc:
            return Response({"detail": exc.message}, status=400)
        return Response(room_payload(room, viewer=request.user))


class RoomReadyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, code):
        ready = True
        if isinstance(request.data, dict) and "ready" in request.data:
            ready = bool(request.data.get("ready"))
        try:
            room = set_ready(request.user, code, ready)
        except GameError as exc:
            return Response({"detail": exc.message}, status=400)
        return Response(room_payload(room, viewer=request.user))


class RoomLeaveView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, code):
        try:
            room = leave_room(request.user, code)
        except GameError as exc:
            return Response({"detail": exc.message}, status=400)
        # Ostalim pošlji osvežitev (lobby ali igra).
        try:
            from asgiref.sync import async_to_sync
            from channels.layers import get_channel_layer
            from game.engine import snapshot
            from game.modes import LOBBY_MODES

            layer = get_channel_layer()
            if layer is not None:
                mode = (room.settings or {}).get("mode")
                if room.status == "waiting" and mode in LOBBY_MODES:
                    payload = refresh_can_start(room_payload(room, viewer=None))
                    payload["type"] = "lobby"
                    payload["phase"] = "lobby"
                    payload["mode"] = mode
                    payload["lobby_event"] = "left"
                elif room.status == "closed":
                    payload = {
                        "type": "error",
                        "phase": "closed",
                        "message": "Soba je zaprta — igralci so odšli.",
                    }
                else:
                    host = room.members.filter(left_at__isnull=True, is_host=True).first()
                    payload = snapshot(str(host.id)) if host else {
                        "type": "error",
                        "phase": "closed",
                        "message": "Soba je zaprta.",
                    }
                async_to_sync(layer.group_send)(
                    f"room_{room.code}",
                    {"type": "game.event", "payload": payload},
                )
        except Exception:
            pass
        return Response({"detail": "Zapustil si sobo.", "status": room.status})


class RoomKickView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, code):
        member_id = request.data.get("member_id") if isinstance(request.data, dict) else None
        if not member_id:
            return Response({"detail": "Manjka member_id."}, status=400)
        try:
            room, member = host_kick_member(request.user, code, member_id)
        except GameError as exc:
            return Response({"detail": exc.message}, status=400)
        notify_room_lobby(
            room,
            lobby_event="kicked",
            lobby_event_member_id=member.id,
            kicked_message=f"Host je vrgel {member.nickname_in_room}.",
        )
        return Response(
            {
                "detail": f"Igralec {member.nickname_in_room} je odstranjen.",
                "room": room_payload(room, viewer=request.user),
            }
        )


class RoomInviteView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, code):
        try:
            room = invite_user(request.user, code, request.data)
        except GameError as exc:
            return Response({"detail": exc.message}, status=400)
        return Response(room_payload(room, viewer=request.user))


class PublicRoomListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        mode = request.query_params.get("mode")
        return Response({"rooms": list_public_rooms(mode=mode)})


class MyInvitesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        mode = request.query_params.get("mode")
        return Response({"rooms": list_invites(request.user, mode=mode)})
