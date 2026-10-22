from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "accounts"
    verbose_name = "Uporabniki"

    def ready(self):
        from django.contrib import admin

        from accounts.admin import EmailAuthenticationForm

        admin.site.login_form = EmailAuthenticationForm
