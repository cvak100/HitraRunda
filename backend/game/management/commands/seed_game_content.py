from django.core.management.base import BaseCommand

from game.seed_content import ensure_bonuses_and_friends


class Command(BaseCommand):
    help = "Ustvari privzete bonuse in prijatelje za Ala milijonar."

    def handle(self, *args, **options):
        ensure_bonuses_and_friends()
        self.stdout.write("Bonusi in prijatelji so pripravljeni.")
