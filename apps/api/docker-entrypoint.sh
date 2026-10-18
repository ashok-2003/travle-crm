#!/bin/sh
# The api image's commands (spec 12.3: one image, a container per command): `api`, `worker` and `console` run until
# stopped; `migrate`, `first-super-admin` and `demo` run once. Each execs Node, so Node is the container's first
# process and SIGTERM reaches it directly: the processes' own drains (apps/api/README.md) do the stopping.
# `api-and-worker` runs the api and the worker in one container, for a host without background workers.
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
  # The api and the worker side by side, for a host with no background workers (Render's free plan,
  # docs/serverless.md). Given DATABASE_MIGRATOR_URL, it first applies the migrations, as `migrate` does, and keeps the
  # URL from both processes. SIGTERM reaches both, and each drains as it does alone. When either ends, the other is
  # stopped too, so the container ends and the host starts it again.
  api-and-worker)
    if [ -n "${DATABASE_MIGRATOR_URL:-}" ]; then
      (cd /app/packages/db && node node_modules/prisma/build/index.js migrate deploy)
      unset DATABASE_MIGRATOR_URL
    fi
    node /app/apps/api/dist/worker.mjs &
    worker=$!
    node /app/apps/api/dist/server.mjs "$@" &
    api=$!
    trap 'kill -TERM "$api" "$worker" 2>/dev/null || true' TERM INT
    # A short sleep the shell waits on, so a signal is handled within a second and an ended process is noticed.
    while kill -0 "$api" 2>/dev/null && kill -0 "$worker" 2>/dev/null; do
      sleep 1 &
      wait "$!" || true
    done
    kill -TERM "$api" "$worker" 2>/dev/null || true
    status=0
    wait "$api" || status=$?
    wait "$worker" || status=$?
    exit "$status"
    ;;
  *)
    echo "Usage: <api | worker | api-and-worker | console | migrate | first-super-admin | demo> [arguments]" >&2
    exit 64
    ;;
esac
