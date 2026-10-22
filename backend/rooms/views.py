from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.nicknames import NicknameError
from game.engine import GameError
from rooms.models import Room
from rooms.services import create_solo_room, room_payload


class RoomCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            room = create_solo_room(request.user, request.data)
        except (GameError, NicknameError) as exc:
            return Response({"detail": exc.message}, status=400)
        return Response(room_payload(room))


class RoomDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, code):
        room = Room.objects.filter(code=code, members__user=request.user).first()
        if room is None:
            return Response({"detail": "Soba ne obstaja."}, status=404)
        return Response(room_payload(room))
