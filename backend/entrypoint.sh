#!/bin/sh
set -e

if [ -n "$POSTGRES_HOST" ]; then
  echo "Cakam na Postgres..."
  until python -c "import socket; socket.create_connection(('${POSTGRES_HOST}', ${POSTGRES_PORT:-5432}), 2).close()" 2>/dev/null; do
    sleep 1
  done
fi

python manage.py migrate --noinput
python manage.py seed_questions
python manage.py seed_game_content
python manage.py ensure_superuser

if [ "$DJANGO_COLLECTSTATIC" = "1" ]; then
  python manage.py collectstatic --noinput
fi

exec "$@"
