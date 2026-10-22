from django.urls import path

from accounts.views import CsrfView, GuestView, LoginView, LogoutView, MeView, NicknameView, RegisterView

urlpatterns = [
    path("csrf/", CsrfView.as_view()),
    path("me/", MeView.as_view()),
    path("nickname/", NicknameView.as_view()),
    path("register/", RegisterView.as_view()),
    path("login/", LoginView.as_view()),
    path("logout/", LogoutView.as_view()),
    path("guest/", GuestView.as_view()),
]
