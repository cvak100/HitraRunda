from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from geo.importer import DATA_DIR, import_countries, import_seed_files, seed_paths


class Command(BaseCommand):
    help = (
        "Uvozi države iz JSON. Brez poti: vsi paketi geo/data/*_drzave.json. "
        "Z potjo: ena datoteka."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "path",
            nargs="?",
            default="",
            help="Pot do JSON (privzeto: vsi *_drzave.json v geo/data/).",
        )
        parser.add_argument("--only-new", action="store_true")

    def handle(self, *args, **options):
        raw_path = str(options.get("path") or "").strip()
        only_new = bool(options["only_new"])
        if raw_path:
            path = Path(raw_path)
            if not path.is_file():
                # Relativno na data/, če gre samo za ime datoteke.
                alt = DATA_DIR / raw_path
                if alt.is_file():
                    path = alt
                else:
                    raise CommandError(f"Datoteka ne obstaja: {raw_path}")
            report = import_countries(path.read_text(encoding="utf-8"), only_new=only_new)
            files = [path.name]
        else:
            if not seed_paths():
                raise CommandError(f"Ni paketov {DATA_DIR}/*_drzave.json")
            report = import_seed_files(only_new=only_new)
            files = report.get("files") or []
        self.stdout.write(
            self.style.SUCCESS(
                f"files={','.join(files)} created={report['created']} "
                f"updated={report['updated']} skipped={report['skipped']} total={report['total']}"
            )
        )
        for err in report.get("errors") or []:
            self.stdout.write(self.style.ERROR(err))
