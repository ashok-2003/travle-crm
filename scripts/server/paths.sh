# Where things are on the server (docs/runbook.md). Sourced by the scripts in scripts/server, never run.
# shellcheck shell=bash disable=SC2034
server_root="/srv/travel-crm"
# The bare repository `scripts/server/release.sh` pushes to, and the checkout the images are built from.
repository="$server_root/repo.git"
checkout="$server_root/app"
# Every setting and secret, root's alone (scripts/server/secrets.sh). TRAVEL_CRM_SETTINGS names another file in the
# same form, for the restore drill on the owner's computer (docs/serverless.md).
settings_file="${TRAVEL_CRM_SETTINGS:-$server_root/production.env}"
# The release (commit) running now, and the one before it, for a rollback.
release_file="$server_root/release"
previous_release_file="$server_root/release.previous"

# Whether the settings point the database at the server's own Postgres (the host `postgres`) rather than a managed one.
uses_local_database() {
  grep -q -s -E "^DATABASE_URL='postgresql://[^@']*@postgres:5432/" "$settings_file"
}
