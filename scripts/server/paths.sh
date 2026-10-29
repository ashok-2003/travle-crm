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
# Whether the console runs its jobs now, `on` or `off` (scripts/server/work-hours.sh writes it; compose.sh hands it to
# the console as CONSOLE_JOBS). Missing: on. TRAVEL_CRM_CONSOLE_JOBS names another file, for work-hours.sh's test.
console_jobs_file="${TRAVEL_CRM_CONSOLE_JOBS:-/etc/travel-crm/console-jobs}"
# The api's wake-up signal (apps/api/src/work-signal.ts): through its container, the api writes the time here when work
# for the worker came in, and scripts/server/work-hours.sh starts a worker the night stopped. Its folder belongs to the
# api's user, `node` in its image (uid and gid 1000). TRAVEL_CRM_WORK_SIGNAL names another file, for work-hours.sh's test.
work_signal_file="${TRAVEL_CRM_WORK_SIGNAL:-$server_root/work-signal/at}"
api_user_id=1000

# Whether the settings point the database at the server's own Postgres (the host `postgres`) rather than a managed one.
uses_local_database() {
  grep -q -s -E "^DATABASE_URL='postgresql://[^@']*@postgres:5432/" "$settings_file"
}

# What this server runs (docker-compose.server.yml): `all`, or one of the two small servers, `api` or `console`
# (docs/runbook.md, "Two small servers"). Settings without SERVER_ROLE are `all`.
server_role() {
  local role
  role="$(sed -n -E "s/^SERVER_ROLE='(.*)'\$/\1/p" "$settings_file" 2>/dev/null | tail -n 1)"
  echo "${role:-all}"
}

# Whether the settings hold DATABASE_MIGRATOR_URL, so this server applies each release's migrations. Without it they are
# applied before the release, from the owner's computer.
runs_migrations() {
  grep -q -s -E "^DATABASE_MIGRATOR_URL='.+'\$" "$settings_file"
}
