from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from geo.importer import SEED_PATH, import_countries


class Command(BaseCommand):
    help = "Uvozi države iz JSON (privzeto geo/data/countries_seed.json)."

    def add_arguments(self, parser):
        parser.add_argument("path", nargs="?", default=str(SEED_PATH))
        parser.add_argument("--only-new", action="store_true")

    def handle(self, *args, **options):
        path = Path(options["path"])
        if not path.is_file():
            raise CommandError(f"Datoteka ne obstaja: {path}")
        report = import_countries(path.read_text(encoding="utf-8"), only_new=options["only_new"])
        self.stdout.write(
            self.style.SUCCESS(
                f"created={report['created']} updated={report['updated']} "
                f"skipped={report['skipped']} total={report['total']}"
            )
        )
        for err in report["errors"]:
            self.stdout.write(self.style.ERROR(err))
