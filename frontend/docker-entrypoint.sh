#!/bin/sh
set -e
if [ ! -d node_modules/react ]; then
  npm install
fi
exec "$@"
