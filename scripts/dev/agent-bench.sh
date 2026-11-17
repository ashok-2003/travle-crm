#!/usr/bin/env bash
# `pnpm agent:bench [-- --cases <folder>] [--report <file>] [--fake]`: replays test chats through the lite agent on a
# throwaway Postgres 18 in Docker (migrated as a deploy does), with the model from .env, and writes a private report
# outside the repository. The database is removed however the run ends; its exit code is this script's.
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/docker/images.sh
source scripts/docker/support.sh

container="travel-crm-agent-bench-$$"
trap 'docker rm --force --volumes "$container" >/dev/null 2>&1 || true' EXIT

docker run --detach --name "$container" --env POSTGRES_PASSWORD=postgres --env POSTGRES_DB=travel_crm \
  --volume "$PWD/packages/db/sql/bootstrap.sql:/docker-entrypoint-initdb.d/10-bootstrap.sql:ro" \
  --publish 127.0.0.1::5432 "$postgres_image" >/dev/null
# Over TCP: while the image runs bootstrap.sql, Postgres listens on its socket only.
wait_until "Postgres starting" docker exec "$container" pg_isready --host 127.0.0.1 --username postgres
port="$(docker port "$container" 5432 | sed -n '1s/.*://p')"
export PRISMA_HIDE_UPDATE_MESSAGE=1

(cd packages/db && DATABASE_MIGRATOR_URL="postgresql://app_migrator:migrator@127.0.0.1:$port/travel_crm" \
  node_modules/.bin/prisma migrate deploy)

# The environment wins over .env, so the command can only reach this container.
export DATABASE_URL="postgresql://app_runtime:runtime@127.0.0.1:$port/travel_crm"
export DATABASE_PLATFORM_URL="postgresql://app_platform:platform@127.0.0.1:$port/travel_crm"
status=0
pnpm --filter @travel-crm/api-server run agent-bench -- "$@" || status=$?
exit "$status"
