from django.core.management.base import BaseCommand

from questions.importer import import_payload


class Command(BaseCommand):
    help = "Uvozi vprašanja iz JSON datoteke."

    def add_arguments(self, parser):
        parser.add_argument("path")

    def handle(self, *args, **options):
        with open(options["path"], encoding="utf-8-sig") as handle:
            report = import_payload(handle.read())
        if report["errors"]:
            for error in report["errors"]:
                self.stderr.write(error)
            raise SystemExit(1)
        self.stdout.write(
            f"Vprašanja: novih {report['created']}, posodobljenih {report['updated']}."
        )
