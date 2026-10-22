import secrets

from django.db import IntegrityError, transaction

from accounts.nicknames import NicknameError, clean_nickname
from game.engine import GameError, validate_settings
from rooms.models import Room, RoomMember

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def create_solo_room(user, raw):
    nickname = clean_nickname(raw.get("nickname") or user.nickname)
    settings = validate_settings(raw if isinstance(raw, dict) else {})
    for _ in range(20):
        code = "".join(secrets.choice(ALPHABET) for _ in range(6))
        try:
            with transaction.atomic():
                room = Room.objects.create(
                    code=code,
                    host=user,
                    visibility="unlisted",
                    status="waiting",
                    settings=settings,
                    max_players=1,
                    name="Milijonar",
                )
                RoomMember.objects.create(
                    room=room,
                    user=user,
                    nickname_in_room=nickname,
                    color=user.preferred_color or "#e6b325",
                    is_host=True,
                )
        except IntegrityError:
            continue
        if not user.nickname:
            user.nickname = nickname
            user.save(update_fields=["nickname"])
        return room
    raise GameError("Sobe ni bilo mogoče ustvariti.")


def room_payload(room):
    return {
        "code": room.code,
        "name": room.name,
        "status": room.status,
        "visibility": room.visibility,
        "max_players": room.max_players,
        "settings": room.settings,
    }
