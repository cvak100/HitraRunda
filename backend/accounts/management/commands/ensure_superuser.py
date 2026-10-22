import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Ustvari admina iz DJANGO_SUPERUSER_EMAIL in DJANGO_SUPERUSER_PASSWORD."

    def handle(self, *args, **options):
        email = os.environ.get("DJANGO_SUPERUSER_EMAIL", "").strip().lower()
        password = os.environ.get("DJANGO_SUPERUSER_PASSWORD", "")
        if not email or not password:
            return
        User = get_user_model()
        if User.objects.filter(email=email).exists():
            self.stdout.write("Admin že obstaja.")
            return
        User.objects.create_superuser(
            username=email,
            email=email,
            password=password,
            nickname="Admin",
        )
        self.stdout.write(f"Ustvarjen admin {email}")
