from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.forms import AuthenticationForm
from django import forms

from accounts.models import User


class EmailAuthenticationForm(AuthenticationForm):
    username = forms.EmailField(
        label="E-pošta",
        widget=forms.EmailInput(attrs={"autofocus": True, "autocomplete": "username"}),
    )


class CustomUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (
        ("Hitra runda", {"fields": ("nickname", "avatar", "preferred_color", "created_at", "last_seen")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("username", "email", "nickname", "password1", "password2"),
            },
        ),
    )
    readonly_fields = ("created_at", "last_seen")
    list_display = ("username", "email", "nickname", "is_staff", "created_at")
    search_fields = ("username", "email", "nickname")


admin.site.register(User, CustomUserAdmin)
