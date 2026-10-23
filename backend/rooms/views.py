from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.nicknames import NicknameError
from game.engine import GameError
from rooms.models import Room
from rooms.services import (
    create_multiplayer_room,
    create_solo_room,
    invite_user,
    join_room,
    list_invites,
    list_public_rooms,
    room_payload,
    set_ready,
    update_room_settings,
)


class RoomCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        raw = request.data if isinstance(request.data, dict) else {}
        try:
            if raw.get("mode") == "multiplayer":
                room = create_multiplayer_room(request.user, raw)
            else:
                room = create_solo_room(request.user, raw)
        except (GameError, NicknameError) as exc:
            return Response({"detail": exc.message}, status=400)
        return Response(room_payload(room, viewer=request.user))


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
        room = Room.objects.filter(code=code.upper()).first()
        if room is None:
            return Response({"detail": "Soba ne obstaja."}, status=404)
        member = room.members.filter(user=request.user, left_at__isnull=True).first()
        if member is None and room.visibility == "private":
            return Response({"detail": "Soba ne obstaja."}, status=404)
        if member is None and room.visibility != "public":
            # unlisted: allow detail only if member; public can preview
            return Response({"detail": "Nisi v sobi."}, status=403)
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
        return Response({"rooms": list_public_rooms()})


class MyInvitesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"rooms": list_invites(request.user)})
