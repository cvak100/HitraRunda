import re
from urllib.parse import urljoin

from django.conf import settings
from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.utils.decorators import method_decorator
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle
from rest_framework.views import APIView


class AuthBurstThrottle(ScopedRateThrottle):
    scope = "auth"


class GuestBurstThrottle(ScopedRateThrottle):
    scope = "guest"


class RegisterThrottle(ScopedRateThrottle):
    scope = "register"


class PasswordResetThrottle(ScopedRateThrottle):
    scope = "password_reset"

from accounts.models import User, create_guest
from accounts.nicknames import (
    AVATAR_KEYS,
    AVATAR_PROFILES,
    NicknameError,
    clean_nickname,
    random_nickname,
)

COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


def user_payload(user):
    if not user or not user.is_authenticated:
        return None
    return {
        "id": user.id,
        "email": user.email,
        "nickname": user.nickname,
        "is_guest": user.is_guest,
        "is_staff": user.is_staff,
        "avatar": user.avatar or "",
        "preferred_color": user.preferred_color or "",
    }


def _parse_color(value):
    color = str(value or "").strip()
    if not color:
        return ""
    if not COLOR_RE.match(color):
        raise ValueError("Barva mora biti hex (npr. #7dcea0).")
    return color.lower()


def _parse_avatar(value):
    avatar = str(value or "").strip().lower()
    if not avatar:
        return ""
    if avatar not in AVATAR_KEYS:
        raise ValueError("Neznan risani profil.")
    return avatar


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
        user = request.user
        data = request.data if isinstance(request.data, dict) else {}
        update_fields = []

        if "nickname" in data:
            try:
                nickname = clean_nickname(data.get("nickname"))
            except NicknameError as exc:
                return Response({"detail": exc.message}, status=400)
            user.nickname = nickname
            update_fields.append("nickname")

        if "preferred_color" in data:
            try:
                user.preferred_color = _parse_color(data.get("preferred_color"))
            except ValueError as exc:
                return Response({"detail": str(exc)}, status=400)
            update_fields.append("preferred_color")

        if "avatar" in data:
            try:
                user.avatar = _parse_avatar(data.get("avatar"))
            except ValueError as exc:
                return Response({"detail": str(exc)}, status=400)
            update_fields.append("avatar")

        if not update_fields:
            return Response({"detail": "Ni sprememb."}, status=400)
        user.save(update_fields=update_fields)
        return Response({"user": user_payload(user)})


class NicknameView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"nickname": random_nickname()})


class AvatarListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"avatars": list(AVATAR_PROFILES)})


class RegisterView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AnonRateThrottle, AuthBurstThrottle, RegisterThrottle]

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

        from accounts.nicknames import random_avatar_color, resolve_avatar_key

        # Gost → račun: pretvori trenutno sejo (rezultati ostanejo na istem user id).
        if request.user.is_authenticated and request.user.is_guest:
            user = request.user
            if User.objects.filter(email=email).exclude(pk=user.pk).exists():
                return Response({"detail": "Račun s tem e-poštnim naslovom že obstaja."}, status=400)
            with transaction.atomic():
                user.email = email
                user.username = email
                user.nickname = nickname
                if not user.avatar:
                    user.avatar = resolve_avatar_key(nickname=nickname, seed=str(user.pk))
                if not user.preferred_color:
                    user.preferred_color = random_avatar_color(str(user.pk))
                user.set_password(password)
                user.save()
                from game.models import GameResult

                GameResult.objects.filter(user=user).update(is_guest=False)
            login(request, user, backend="accounts.backends.EmailBackend")
            return Response({"user": user_payload(user), "converted": True})

        try:
            seed = email
            user = User.objects.create_user(
                username=email,
                email=email,
                password=password,
                nickname=nickname,
                avatar=resolve_avatar_key(nickname=nickname, seed=seed),
                preferred_color=random_avatar_color(seed),
            )
        except IntegrityError:
            return Response({"detail": "Račun s tem e-poštnim naslovom že obstaja."}, status=400)
        login(request, user, backend="accounts.backends.EmailBackend")
        return Response({"user": user_payload(user), "converted": False})


class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AnonRateThrottle, AuthBurstThrottle]

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
    throttle_classes = [AnonRateThrottle, GuestBurstThrottle]

    def post(self, request):
        try:
            nickname = clean_nickname(request.data.get("nickname"))
        except NicknameError as exc:
            return Response({"detail": exc.message}, status=400)
        user = create_guest(nickname)
        login(request, user, backend="accounts.backends.EmailBackend")
        return Response({"user": user_payload(user)})


class PasswordChangeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        if user.is_guest:
            return Response({"detail": "Gost nima gesla — najprej ustvari račun."}, status=400)
        current = request.data.get("current_password") or ""
        new_password = request.data.get("new_password") or ""
        if not user.check_password(current):
            return Response({"detail": "Trenutno geslo ni pravilno."}, status=400)
        try:
            validate_password(new_password, user=user)
        except DjangoValidationError as exc:
            return Response({"detail": " ".join(exc.messages)}, status=400)
        user.set_password(new_password)
        user.save(update_fields=["password"])
        update_session_auth_hash(request, user)
        return Response({"detail": "Geslo je spremenjeno."})


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AnonRateThrottle, PasswordResetThrottle]

    def post(self, request):
        email = str(request.data.get("email") or "").strip().lower()
        # Vedno enak odgovor — ne razkrivamo, ali e-pošta obstaja.
        detail = "Če račun obstaja, smo poslali povezavo za ponastavitev gesla."
        if "@" not in email:
            return Response({"detail": detail})
        user = User.objects.filter(email=email).first()
        if user is None or user.is_guest:
            return Response({"detail": detail})
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        base = (getattr(settings, "APP_URL", None) or "").rstrip("/") or "http://localhost:5008"
        link = urljoin(base + "/", f"ponastavi-geslo?uid={uid}&token={token}")
        subject = "Hitra runda — ponastavitev gesla"
        body = (
            f"Pozdravljen/a {user.nickname or ''}!\n\n"
            f"Za ponastavitev gesla odpri povezavo:\n{link}\n\n"
            f"Če tega nisi zahteval/a, sporočilo prezri.\n"
        )
        try:
            send_mail(
                subject,
                body,
                getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@hitrarunda.local"),
                [email],
                fail_silently=False,
            )
        except Exception:
            # V razvoju/testih: vrnemo link, da gre lahko brez SMTP.
            if settings.DEBUG or getattr(settings, "TESTING", False):
                return Response({"detail": detail, "debug_link": link})
            return Response({"detail": detail})
        payload = {"detail": detail}
        # Console/locmem: priročni link za UI in teste (ne za produkcijski SMTP).
        if settings.DEBUG or getattr(settings, "TESTING", False):
            payload["debug_link"] = link
        return Response(payload)


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        uid = str(request.data.get("uid") or "").strip()
        token = str(request.data.get("token") or "").strip()
        password = request.data.get("password") or ""
        if not uid or not token:
            return Response({"detail": "Manjkata uid in token."}, status=400)
        try:
            user_id = force_str(urlsafe_base64_decode(uid))
            user = User.objects.get(pk=user_id)
        except (User.DoesNotExist, ValueError, TypeError, OverflowError):
            return Response({"detail": "Povezava ni veljavna."}, status=400)
        if not default_token_generator.check_token(user, token):
            return Response({"detail": "Povezava je potekla ali ni veljavna."}, status=400)
        try:
            validate_password(password, user=user)
        except DjangoValidationError as exc:
            return Response({"detail": " ".join(exc.messages)}, status=400)
        user.set_password(password)
        user.save(update_fields=["password"])
        return Response({"detail": "Geslo je ponastavljeno. Lahko se prijaviš."})
