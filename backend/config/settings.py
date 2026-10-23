import os
import sys
from pathlib import Path
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent.parent


def env(name, default=""):
    return os.environ.get(name, default)


def split_csv(value):
    return [item.strip() for item in value.split(",") if item.strip()]


DEBUG = env("DJANGO_DEBUG", "0") == "1"
TESTING = "test" in sys.argv

SECRET_KEY = env("DJANGO_SECRET_KEY")
if not SECRET_KEY:
    if DEBUG or TESTING:
        SECRET_KEY = "dev-only-not-for-production"
    else:
        raise RuntimeError("Nastavi DJANGO_SECRET_KEY.")

# Ena javna URL (http://… ali https://…) nastavi hoste, CSRF in piškotke.
APP_URL = env("APP_URL", "").rstrip("/")
_app = urlparse(APP_URL) if APP_URL else None

_hosts_raw = env("DJANGO_ALLOWED_HOSTS", "").strip()
ALLOWED_HOSTS = (
    split_csv(_hosts_raw) if _hosts_raw else ["localhost", "127.0.0.1", "backend"]
)
_csrf_raw = env("DJANGO_CSRF_TRUSTED_ORIGINS", "").strip()
CSRF_TRUSTED_ORIGINS = (
    split_csv(_csrf_raw)
    if _csrf_raw
    else ["http://localhost:5008", "http://127.0.0.1:5008"]
)

if _app and _app.hostname:
    for host in (_app.hostname, f"{_app.hostname}:{_app.port}" if _app.port else None):
        if host and host not in ALLOWED_HOSTS:
            ALLOWED_HOSTS.append(host)
    if "backend" not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append("backend")
    if APP_URL not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(APP_URL)

INSTALLED_APPS = [
    "daphne",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "channels",
    "accounts",
    "rooms",
    "questions",
    "game",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "accounts.middleware.LastSeenMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    }
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("POSTGRES_DB", "hitrarunda"),
        "USER": env("POSTGRES_USER", "hitrarunda"),
        "PASSWORD": env("POSTGRES_PASSWORD", "hitrarunda"),
        "HOST": env("POSTGRES_HOST", "localhost"),
        "PORT": env("POSTGRES_PORT", "5432"),
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 4}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "sl"
TIME_ZONE = "Europe/Ljubljana"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "accounts.User"
AUTHENTICATION_BACKENDS = ["accounts.backends.EmailBackend"]

_cookie_secure_raw = env("DJANGO_COOKIE_SECURE", "").strip()
if _cookie_secure_raw in ("0", "1"):
    COOKIE_SECURE = _cookie_secure_raw == "1"
else:
    COOKIE_SECURE = bool(_app and _app.scheme == "https")
SESSION_COOKIE_SECURE = COOKIE_SECURE
CSRF_COOKIE_SECURE = COOKIE_SECURE
CSRF_COOKIE_HTTPONLY = False
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"

# Za reverse proxy (nginx / Caddy): spoštuj X-Forwarded-Proto in Host.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True

CORS_ALLOWED_ORIGINS = CSRF_TRUSTED_ORIGINS
CORS_ALLOW_CREDENTIALS = True

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
}

REDIS_URL = env("REDIS_URL", "redis://localhost:6379/0")
# redis-py 8 sets socket_timeout to 5s. The channel layer blocks on Redis for
# the same 5s, so the read times out and Daphne closes the game socket.
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [
                {
                    "address": REDIS_URL,
                    "socket_timeout": None,
                    "socket_connect_timeout": 5,
                }
            ],
        },
    }
}

DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}

if TESTING:
    CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
    PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
