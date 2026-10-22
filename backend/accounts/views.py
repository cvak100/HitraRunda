from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User, create_guest
from accounts.nicknames import NicknameError, clean_nickname, random_nickname


def user_payload(user):
    if not user or not user.is_authenticated:
        return None
    return {
        "id": user.id,
        "email": user.email,
        "nickname": user.nickname,
        "is_guest": user.is_guest,
        "is_staff": user.is_staff,
    }


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"ok": True})


class MeView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"user": user_payload(request.user)})

    def patch(self, request):
        if not request.user.is_authenticated:
            return Response({"detail": "Prijavi se."}, status=403)
        try:
            nickname = clean_nickname(request.data.get("nickname"))
        except NicknameError as exc:
            return Response({"detail": exc.message}, status=400)
        request.user.nickname = nickname
        request.user.save(update_fields=["nickname"])
        return Response({"user": user_payload(request.user)})


class NicknameView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"nickname": random_nickname()})


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = str(request.data.get("email") or "").strip().lower()
        password = request.data.get("password") or ""
        if "@" not in email:
            return Response({"detail": "Vpiši veljaven e-poštni naslov."}, status=400)
        try:
            nickname = clean_nickname(request.data.get("nickname"))
            validate_password(password)
        except NicknameError as exc:
            return Response({"detail": exc.message}, status=400)
        except DjangoValidationError as exc:
            return Response({"detail": " ".join(exc.messages)}, status=400)
        try:
            user = User.objects.create_user(
                username=email,
                email=email,
                password=password,
                nickname=nickname,
            )
        except IntegrityError:
            return Response({"detail": "Račun s tem e-poštnim naslovom že obstaja."}, status=400)
        login(request, user, backend="accounts.backends.EmailBackend")
        return Response({"user": user_payload(user)})


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = str(request.data.get("email") or "").strip().lower()
        password = request.data.get("password") or ""
        user = authenticate(request, username=email, password=password)
        if user is None:
            return Response({"detail": "Napačen e-poštni naslov ali geslo."}, status=400)
        login(request, user)
        return Response({"user": user_payload(user)})


class LogoutView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        logout(request)
        return Response({"user": None})


class GuestView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        try:
            nickname = clean_nickname(request.data.get("nickname"))
        except NicknameError as exc:
            return Response({"detail": exc.message}, status=400)
        user = create_guest(nickname)
        login(request, user, backend="accounts.backends.EmailBackend")
        return Response({"user": user_payload(user)})
