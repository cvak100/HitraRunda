from datetime import timedelta

from django.db.models import Exists, OuterRef
from django.utils import timezone

from accounts.models import User
from rooms.models import RoomMember


def cleanup_stale_guests(days=None):
    if days is None:
        try:
            from game.site_settings import get as site_get

            days = int(site_get("guest_cleanup_days"))
        except Exception:
            days = 7
    cutoff = timezone.now() - timedelta(days=days)
    active = RoomMember.objects.filter(
        user=OuterRef("pk"),
        left_at__isnull=True,
        room__status__in=["waiting", "playing"],
        last_activity__gte=cutoff,
    )
    guests = User.objects.filter(
        email__isnull=True,
        is_staff=False,
        is_superuser=False,
        created_at__lt=cutoff,
    ).exclude(Exists(active))
    count = guests.count()
    guests.delete()
    return count
