from django.core.management.base import BaseCommand

from geo.importer import ensure_seed_countries, import_seed_files


class Command(BaseCommand):
    help = (
        "Uvozi seed države. Privzeto samo če je tabela prazna (prva inštalacija). "
        "Z --force uvozi/posodobi vse pakete."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Uvozi tudi če države že obstajajo (upsert).",
        )
        parser.add_argument("--only-new", action="store_true")

    def handle(self, *args, **options):
        if options["force"]:
            report = import_seed_files(only_new=bool(options["only_new"]))
            self.stdout.write(
                self.style.SUCCESS(
                    f"force files={','.join(report.get('files') or [])} "
                    f"created={report['created']} updated={report['updated']} "
                    f"skipped={report['skipped']} total={report['total']}"
                )
            )
        else:
            report = ensure_seed_countries()
            if report.get("created") or report.get("updated"):
                self.stdout.write(
                    self.style.SUCCESS(
                        f"seed files={','.join(report.get('files') or [])} "
                        f"created={report['created']} total={report['total']}"
                    )
                )
            else:
                self.stdout.write(
                    f"Države že v bazi ({report['total']}) — seed preskočen."
                )
        for err in report.get("errors") or []:
            self.stdout.write(self.style.ERROR(err))
