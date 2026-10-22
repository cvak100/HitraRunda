import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Registriran uporabnik ima e-pošto. Gost je uporabnik brez e-pošte.

    Prijava v API in admin gre prek e-pošte. Tehnično polje `username`
    je pri registriranih enako e-pošti, pri gostih pa naključni ključ,
    ker e-pošta pri gostu manjka.
    """

    email = models.EmailField(unique=True, null=True, blank=True)
    nickname = models.CharField(max_length=30, blank=True)
    avatar = models.URLField(max_length=500, blank=True, null=True)
    preferred_color = models.CharField(max_length=20, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        if self.email:
            self.email = self.email.strip().lower()
        super().save(*args, **kwargs)

    @property
    def is_guest(self):
        return not self.email

    def __str__(self):
        return self.nickname or self.email or self.username


def create_guest(nickname):
    user = User(
        username=f"guest-{uuid.uuid4().hex}",
        email=None,
        nickname=nickname,
    )
    user.set_unusable_password()
    user.save()
    return user
