#!/usr/bin/env bash
# The nightly backup. It dumps the whole database and encrypts the dump with age to the owner's public key before
# writing it anywhere, since it holds customers' personal data, then copies it to db/ in the backups' own R2 bucket,
# whose lifecycle rule deletes it after 14 days. Whoever runs it can make a backup but can't read one: the private key
# is the owner's alone. It runs in two places:
# - on the pilot server (systemd/travel-crm-backup.timer, docs/runbook.md), reading the server's settings, as root:
#     sudo scripts/server/backup.sh
#   There it also copies the server's settings, encrypted the same way, to settings/: a new server needs the web push
#   pair (kept for good) and the auth secret (or everyone signs in again).
# - in GitHub Actions for the serverless pilot (.github/workflows/backup.yml, docs/serverless.md), with the same
#   settings as environment variables and no settings file.
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/server/paths.sh
source scripts/docker/images.sh
source scripts/server/backup-bucket.sh
if [ -r "$settings_file" ]; then
  # shellcheck source=/dev/null
  source "$settings_file"
fi
: "${S3_ENDPOINT:?}" "${BACKUP_S3_BUCKET:?}" "${BACKUP_S3_ACCESS_KEY_ID:?}" "${BACKUP_S3_SECRET_ACCESS_KEY:?}"
: "${BACKUP_AGE_RECIPIENT:?}"

stamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
name="travel_crm-$stamp.dump.age"
work="$(mktemp -d "${TMPDIR:-/var/tmp}/travel-crm-backup.XXXXXX")"
trap 'rm -rf "$work"' EXIT

# The whole database, as a role row-level security doesn't hide rows from (every organization table forces it, even
# for its owner): the server's own Postgres's superuser, or a managed one's admin role. DATABASE_ADMIN_ROLE names a
# role to switch to first, where the admin bypasses row-level security only through one (Neon's owner needs none).
dump() {
  if uses_local_database; then
    scripts/server/compose.sh exec -T postgres pg_dump --username postgres --dbname travel_crm --format custom
  else
    [ -n "${DATABASE_ADMIN_URL:-}" ] || {
      echo "DATABASE_ADMIN_URL is empty: a managed database's backup needs its admin role" >&2
      return 1
    }
    DATABASE_ADMIN_URL="$DATABASE_ADMIN_URL" DATABASE_ADMIN_ROLE="${DATABASE_ADMIN_ROLE:-}" docker run --rm \
      --env DATABASE_ADMIN_URL --env DATABASE_ADMIN_ROLE "$postgres_image" \
      sh -c 'exec pg_dump --format custom ${DATABASE_ADMIN_ROLE:+--role="$DATABASE_ADMIN_ROLE"} \
        --dbname "$DATABASE_ADMIN_URL"'
  fi
}

echo "Dumping the database, encrypted to the owner's key"
dump | age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" >"$work/$name"
echo "Copying $name ($(du -h "$work/$name" | cut -f 1)) to $BACKUP_S3_BUCKET/db/"
rclone_backups "$work" copyto "/backup/$name" "r2:$BACKUP_S3_BUCKET/db/$name"
if [ -r "$settings_file" ]; then
  settings_name="production-$stamp.env.age"
  age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" "$settings_file" >"$work/$settings_name"
  rclone_backups "$work" copyto "/backup/$settings_name" "r2:$BACKUP_S3_BUCKET/settings/$settings_name"
fi

if [ -n "${BACKUP_HEARTBEAT_URL:-}" ]; then
  curl --silent --show-error --fail --max-time 10 --retry 3 --output /dev/null "$BACKUP_HEARTBEAT_URL"
fi
echo "Backed up $name"
