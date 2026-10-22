import uuid

from django.conf import settings
from django.db import models


class Room(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=8, unique=True)
    name = models.CharField(max_length=100, blank=True)
    host = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="hosted_rooms",
    )
    visibility = models.CharField(
        max_length=10,
        choices=[
            ("public", "Javna"),
            ("private", "Zasebna"),
            ("unlisted", "Skrita"),
        ],
        default="public",
    )
    password = models.CharField(max_length=128, blank=True, default="")
    status = models.CharField(
        max_length=10,
        choices=[
            ("waiting", "Čakanje"),
            ("playing", "V teku"),
            ("finished", "Končana"),
        ],
        default="waiting",
    )
    settings = models.JSONField(default=dict)
    max_players = models.PositiveSmallIntegerField(default=2)
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "soba"
        verbose_name_plural = "sobe"
        ordering = ["-created_at"]

    def __str__(self):
        return self.code

    def set_password(self, raw):
        from django.contrib.auth.hashers import make_password

        self.password = make_password(raw) if raw else ""

    def check_password(self, raw):
        from django.contrib.auth.hashers import check_password

        if not self.password:
            return not raw
        return check_password(raw or "", self.password)


class RoomMember(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="members")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="room_memberships",
    )
    nickname_in_room = models.CharField(max_length=30)
    color = models.CharField(max_length=20, blank=True)
    is_host = models.BooleanField(default=False)
    is_ready = models.BooleanField(default=False)
    is_connected = models.BooleanField(default=False)
    joined_at = models.DateTimeField(auto_now_add=True)
    left_at = models.DateTimeField(null=True, blank=True)
    last_activity = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "član sobe"
        verbose_name_plural = "člani sob"
        unique_together = [("room", "nickname_in_room")]

    def __str__(self):
        return f"{self.nickname_in_room} @ {self.room.code}"
