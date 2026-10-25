#!/bin/sh
set -e

if [ -n "$POSTGRES_HOST" ]; then
  echo "Cakam na Postgres..."
  until python -c "import socket; socket.create_connection(('${POSTGRES_HOST}', ${POSTGRES_PORT:-5432}), 2).close()" 2>/dev/null; do
    sleep 1
  done
fi

python manage.py migrate --noinput

# Vprašanja samo ob prazni bazi (prvi zagon). Kasneje ročno:
#   docker compose exec backend python manage.py seed_questions --only-new
if python -c "
import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()
from questions.models import Question
raise SystemExit(0 if Question.objects.exists() else 1)
"; then
  echo "Vprašanja že v bazi — seed preskočen."
else
  echo "Prvi zagon: uvažam vprašanja..."
  python manage.py seed_questions
fi

# Države (ugib zastav) samo ob prazni bazi.
if python -c "
import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()
from geo.models import Country
raise SystemExit(0 if Country.objects.exists() else 1)
"; then
  echo "Drzave ze v bazi — seed preskocen."
else
  echo "Prvi zagon: uvazam drzave..."
  python manage.py seed_countries
fi

python manage.py seed_game_content
python manage.py ensure_superuser

if [ "$DJANGO_COLLECTSTATIC" = "1" ]; then
  python manage.py collectstatic --noinput
fi

exec "$@"
