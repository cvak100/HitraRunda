from django.urls import path

from accounts.views import (
    AvatarListView,
    CsrfView,
    GuestView,
    LoginView,
    LogoutView,
    MeView,
    NicknameView,
    PasswordChangeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    RegisterView,
)

urlpatterns = [
    path("csrf/", CsrfView.as_view()),
    path("me/", MeView.as_view()),
    path("nickname/", NicknameView.as_view()),
    path("avatars/", AvatarListView.as_view()),
    path("register/", RegisterView.as_view()),
    path("login/", LoginView.as_view()),
    path("logout/", LogoutView.as_view()),
    path("guest/", GuestView.as_view()),
    path("password/", PasswordChangeView.as_view()),
    path("password-reset/", PasswordResetRequestView.as_view()),
    path("password-reset/confirm/", PasswordResetConfirmView.as_view()),
]
