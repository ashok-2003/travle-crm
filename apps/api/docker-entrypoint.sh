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
  # URL from both processes. The worker starts once the api answers /health (or ends), so the two don't share a small
  # host's CPU while they start and the api is up sooner. SIGTERM reaches both, and each drains as it does alone. When
  # either ends, the other is stopped too, so the container ends and the host starts it again.
  api-and-worker)
    if [ -n "${DATABASE_MIGRATOR_URL:-}" ]; then
      (cd /app/packages/db && node node_modules/prisma/build/index.js migrate deploy)
      unset DATABASE_MIGRATOR_URL
    fi
    node /app/apps/api/dist/server.mjs "$@" &
    api=$!
    worker=""
    stopping=""
    trap 'stopping=yes; kill -TERM "$api" ${worker:+"$worker"} 2>/dev/null || true' TERM INT
    node --eval '
      const [pid, port] = process.argv.slice(1);
      const alive = () => { try { process.kill(Number(pid), 0); return true; } catch { return false; } };
      const answers = () => fetch("http://127.0.0.1:" + port + "/health").then((r) => r.ok, () => false);
      (async () => { while (alive() && !(await answers())) await new Promise((r) => setTimeout(r, 1000)); })();
    ' "$api" "${PORT:-3001}" &
    wait "$!" || true
    if [ -z "$stopping" ] && kill -0 "$api" 2>/dev/null; then
      node /app/apps/api/dist/worker.mjs &
      worker=$!
    fi
    # A short sleep the shell waits on, so a signal is handled within a second and an ended process is noticed.
    while kill -0 "$api" 2>/dev/null && { [ -z "$worker" ] || kill -0 "$worker" 2>/dev/null; }; do
      sleep 1 &
      wait "$!" || true
    done
    kill -TERM "$api" ${worker:+"$worker"} 2>/dev/null || true
    status=0
    wait "$api" || status=$?
    if [ -n "$worker" ]; then wait "$worker" || status=$?; fi
    exit "$status"
    ;;
  *)
    echo "Usage: <api | worker | api-and-worker | console | migrate | first-super-admin | demo> [arguments]" >&2
    exit 64
    ;;
esac
