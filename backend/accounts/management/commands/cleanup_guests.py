from django.core.management.base import BaseCommand

from accounts.cleanup import cleanup_stale_guests


class Command(BaseCommand):
    help = "Zbriše goste, starejše od 7 dni, brez sveže odprte sobe. Rezultati ostanejo."

    def handle(self, *args, **options):
        count = cleanup_stale_guests()
        self.stdout.write(f"Pobrisanih gostov: {count}")
