from django.core.management.base import BaseCommand

from questions.importer import import_payload, seed_path


class Command(BaseCommand):
    help = "Uvozi začetna vprašanja. Isti ključ posodobi obstoječe vprašanje."

    def handle(self, *args, **options):
        path = seed_path()
        report = import_payload(path.read_text(encoding="utf-8-sig"))
        if report["errors"]:
            for error in report["errors"]:
                self.stderr.write(error)
            raise SystemExit(1)
        self.stdout.write(
            f"Vprašanja: novih {report['created']}, posodobljenih {report['updated']}."
        )
