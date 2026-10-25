from django.core.management.base import BaseCommand

from questions.importer import import_payload, seed_path


class Command(BaseCommand):
    help = (
        "Uvozi začetna vprašanja. Privzeto posodobi vsebino, a ne prepiše is_active. "
        "Z --only-new samo doda manjkajoče ključe (varen restart)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--only-new",
            action="store_true",
            help="Obstojčih vprašanj ne posodobi — samo vstavi nova.",
        )
        parser.add_argument(
            "--overwrite-active",
            action="store_true",
            help="Ob posodobitvi prepiši tudi is_active iz seeda (privzeto ne).",
        )

    def handle(self, *args, **options):
        path = seed_path()
        report = import_payload(
            path.read_text(encoding="utf-8-sig"),
            only_new=bool(options.get("only_new")),
            preserve_active=not bool(options.get("overwrite_active")),
        )
        if report["errors"]:
            for error in report["errors"]:
                self.stderr.write(error)
            raise SystemExit(1)
        self.stdout.write(
            "Vprašanja: novih {created}, posodobljenih {updated}, preskočenih {skipped}.".format(
                created=report["created"],
                updated=report["updated"],
                skipped=report.get("skipped") or 0,
            )
        )
