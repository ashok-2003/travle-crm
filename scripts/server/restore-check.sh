#!/usr/bin/env bash
# The restore drill (docs/runbook.md): proves a backup can be read and restored, without touching production.
# - It takes the newest backup from R2, or the one named.
# - It decrypts it with the owner's private key, read from stdin and never written to disk.
# - It restores it into a throwaway Postgres, with the roles bootstrap.sql makes, on a network of its own.
# - It runs the running release's `migrate` there (nothing should be pending), checks the grant the console needs, and
#   counts what came back beside production's counts now.
# - Then it deletes all of it. No console or api starts on the copy: their jobs would act on the real bucket and mail.
# From the owner's computer, as docs/runbook.md shows:
#   ssh ubuntu@<server> sudo /srv/travel-crm/app/scripts/server/restore-check.sh [<backup name>] < <the age key file>
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/server/paths.sh
source scripts/docker/images.sh
source scripts/docker/support.sh
source scripts/server/backup-bucket.sh
# shellcheck source=/dev/null
source "$settings_file"

identity="$(cat)"
case "$identity" in *AGE-SECRET-KEY-*) ;; *) fail "give the owner's age key file on stdin" ;; esac
started="$SECONDS"
throwaway="travel-crm-restore-$$"
work="$(mktemp -d /var/tmp/travel-crm-restore.XXXXXX)"
cleanup() {
  docker rm --force --volumes "$throwaway" >/dev/null 2>&1 || true
  docker network rm "$throwaway" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

name="${1:-$(rclone_backups "$work" lsf "r2:$BACKUP_S3_BUCKET/db/" | sort | tail -n 1)}"
[ -n "$name" ] || fail "no backup in $BACKUP_S3_BUCKET/db/"
echo "Fetching $name"
rclone_backups "$work" copyto "r2:$BACKUP_S3_BUCKET/db/$name" "/backup/$name"

echo "Starting a throwaway Postgres on a network of its own"
docker network create --internal "$throwaway" >/dev/null
docker run --detach --name "$throwaway" --network "$throwaway" --env POSTGRES_PASSWORD="$(openssl rand -hex 16)" \
  --env POSTGRES_DB=travel_crm \
  --volume "$PWD/packages/db/sql/bootstrap.sql:/docker-entrypoint-initdb.d/10-bootstrap.sql:ro" \
  "$postgres_image" >/dev/null
wait_until "the throwaway Postgres" docker exec "$throwaway" pg_isready --host 127.0.0.1 --username postgres \
  --dbname travel_crm

echo "Decrypting and restoring"
age --decrypt --identity <(printf '%s\n' "$identity") "$work/$name" |
  docker exec --interactive "$throwaway" pg_restore --username postgres --dbname travel_crm --exit-on-error

echo "Running the release's migrate on the copy: nothing should be pending"
docker run --rm --network "$throwaway" --read-only --tmpfs /tmp \
  --env DATABASE_MIGRATOR_URL="postgresql://app_migrator:migrator@$throwaway:5432/travel_crm" \
  "travel-crm-api:$(cut -c 1-12 "$release_file")" migrate | tee "$work/migrate.log"
grep --quiet "No pending migrations" "$work/migrate.log" || fail "the copy had migrations pending"

query() {
  docker exec "$1" psql --username postgres --dbname travel_crm --tuples-only --no-align --command "$2"
}
[ "$(query "$throwaway" "SELECT pg_has_role('app_platform', 'app_runtime', 'SET')")" = "t" ] ||
  fail "the copy's platform role can't step into the runtime role: the console wouldn't start on it"
echo "ok: the platform role's grant is there"

counts="SELECT (SELECT count(*) FROM organization) || ' organizations, ' || (SELECT count(*) FROM \"user\") ||
  ' people who sign in, ' || (SELECT count(*) FROM lead) || ' leads, ' || (SELECT count(*) FROM _prisma_migrations) ||
  ' migrations'"
echo "The copy:        $(query "$throwaway" "$counts")"
if uses_local_database; then
  echo "Production now:  $(query "$(scripts/server/compose.sh ps --quiet postgres)" "$counts")"
else
  production="$(DATABASE_ADMIN_URL="$DATABASE_ADMIN_URL" docker run --rm --env DATABASE_ADMIN_URL \
    --env counts="$counts" "$postgres_image" \
    sh -c 'exec psql --tuples-only --no-align --dbname "$DATABASE_ADMIN_URL" --command "$counts"')"
  echo "Production now:  $production"
fi
echo "Restored $name and checked it in $((SECONDS - started)) seconds; the copy is deleted."
