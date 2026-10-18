#!/usr/bin/env bash
# The nightly backup (systemd/travel-crm-backup.timer, docs/runbook.md). It dumps the whole database and encrypts the
# dump with age to the owner's public key before writing it anywhere, since it holds customers' personal data. It
# copies the dump to db/ in the backups' own R2 bucket, and the server's settings, encrypted the same way, to settings/:
# a new server needs the web push pair (kept for good) and the auth secret (or everyone signs in again). The bucket's
# lifecycle rule deletes both after 14 days. The server can make a backup but can't read one: the private key is the
# owner's and never here. As root:
#   sudo scripts/server/backup.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/server/paths.sh
source scripts/docker/images.sh
source scripts/server/backup-bucket.sh
# shellcheck source=/dev/null
source "$settings_file"

stamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
name="travel_crm-$stamp.dump.age"
settings_name="production-$stamp.env.age"
work="$(mktemp -d /var/tmp/travel-crm-backup.XXXXXX)"
trap 'rm -rf "$work"' EXIT

echo "Dumping the database, encrypted to the owner's key"
scripts/server/compose.sh exec -T postgres pg_dump --username postgres --dbname travel_crm --format custom |
  age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" >"$work/$name"
echo "Copying $name ($(du -h "$work/$name" | cut -f 1)) to $BACKUP_S3_BUCKET/db/"
rclone_backups "$work" copyto "/backup/$name" "r2:$BACKUP_S3_BUCKET/db/$name"
age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" "$settings_file" >"$work/$settings_name"
rclone_backups "$work" copyto "/backup/$settings_name" "r2:$BACKUP_S3_BUCKET/settings/$settings_name"

if [ -n "$BACKUP_HEARTBEAT_URL" ]; then
  curl --silent --show-error --fail --max-time 10 --retry 3 --output /dev/null "$BACKUP_HEARTBEAT_URL"
fi
echo "Backed up $name"
