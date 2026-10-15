#!/bin/sh
# The api image's commands (spec 12.3: one image, a container per command): `api`, `worker` and `console` run until
# stopped; `migrate`, `first-super-admin` and `demo` run once. Each execs Node, so Node is the container's first
# process and SIGTERM reaches it directly: the processes' own drains (apps/api/README.md) do the stopping.
set -eu

command="${1:-}"
if [ "$#" -gt 0 ]; then shift; fi

case "$command" in
  api) exec node /app/apps/api/dist/server.mjs "$@" ;;
  worker) exec node /app/apps/api/dist/worker.mjs "$@" ;;
  console) exec node /app/apps/api/dist/console.mjs "$@" ;;
  first-super-admin | demo) exec node /app/apps/api/dist/console-command.mjs "$command" "$@" ;;
  # Applies the migrations as app_migrator (DATABASE_MIGRATOR_URL), with the db package's Prisma config.
  migrate)
    cd /app/packages/db
    exec node node_modules/prisma/build/index.js migrate deploy "$@"
    ;;
  *)
    echo "Usage: <api | worker | console | migrate | first-super-admin | demo> [arguments]" >&2
    exit 64
    ;;
esac
