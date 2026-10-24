from django.core.management.base import BaseCommand

from rooms.services import close_live_rooms


class Command(BaseCommand):
    help = "Zapre vse sobe v čakanju ali teku (admin bulk)."

    def handle(self, *args, **options):
        count = close_live_rooms()
        self.stdout.write(f"Zaprtih sob: {count}")
