from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models import Exists, OuterRef
from django.utils import timezone

from accounts.models import User
from rooms.models import RoomMember


class Command(BaseCommand):
    help = "Zbriše goste, starejše od 7 dni, brez sveže odprte sobe. Rezultati ostanejo."

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(days=7)
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
        self.stdout.write(f"Pobrisanih gostov: {count}")
