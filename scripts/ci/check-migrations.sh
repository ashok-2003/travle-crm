#!/usr/bin/env bash
# `pnpm migrations:check` (a CI gate): every migration applies to an empty Postgres 18 holding bootstrap.sql's roles,
# as a deploy's one-off `migrate` does (spec 12.3), and Prisma then finds no drift between the database and the
# schema, so a schema change without its migration fails here. The database is thrown away, however it ends.
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/docker/images.sh
source scripts/docker/support.sh

container="travel-crm-migrations-$$"
trap 'docker rm --force --volumes "$container" >/dev/null 2>&1 || true' EXIT

docker run --detach --name "$container" --env POSTGRES_PASSWORD=postgres --env POSTGRES_DB=travel_crm \
  --volume "$PWD/packages/db/sql/bootstrap.sql:/docker-entrypoint-initdb.d/10-bootstrap.sql:ro" \
  --publish 127.0.0.1::5432 "$postgres_image" >/dev/null
# Over TCP: while the image runs bootstrap.sql, Postgres listens on its socket only.
wait_until "Postgres starting" docker exec "$container" pg_isready --host 127.0.0.1 --username postgres
port="$(docker port "$container" 5432 | sed -n '1s/.*://p')"
export DATABASE_MIGRATOR_URL="postgresql://app_migrator:migrator@127.0.0.1:$port/travel_crm"
export PRISMA_HIDE_UPDATE_MESSAGE=1

cd packages/db
node_modules/.bin/prisma migrate deploy
# Exit code 2 means "differences found"; anything else but 0 means the check couldn't run.
drift=0
node_modules/.bin/prisma migrate diff --from-config-datasource --to-schema prisma/schema --exit-code || drift=$?
case "$drift" in
  0) ;;
  2) fail "the Prisma schema and the migrations disagree: add the missing migration (packages/db/README.md)" ;;
  *) fail "the drift check couldn't run" ;;
esac
node_modules/.bin/prisma migrate status
echo "Every migration applies to an empty Postgres 18, and the schema matches them."
