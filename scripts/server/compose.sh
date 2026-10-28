#!/usr/bin/env bash
# Runs `docker compose` on the server (docker-compose.server.yml, docs/runbook.md) as the project travel-crm, with the
# server's settings (/srv/travel-crm/production.env, root's alone) and the release whose images run: RELEASE from the
# environment, else the one /srv/travel-crm/release names. Every server script comes through here. Run it as root:
#   sudo scripts/server/compose.sh ps
#   sudo scripts/server/compose.sh logs --tail 100 api
# The settings say which services run here (SERVER_ROLE), so it turns on their profiles.
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/server/paths.sh

[ -r "$settings_file" ] || {
  echo "Can't read $settings_file: run this as root, after scripts/server/secrets.sh init" >&2
  exit 1
}
if [ -z "${RELEASE:-}" ] && [ -f "$release_file" ]; then
  RELEASE="$(cat "$release_file")"
fi
# Before the first deploy there is no release: `ps` and `logs` still work.
export RELEASE="${RELEASE:-none}"
# Whether the console runs its jobs: the working hours' night turns them off (scripts/server/work-hours.sh), and every
# `compose.sh up` keeps what they set. The environment's first, so a one-off run can say otherwise.
if [ -z "${CONSOLE_JOBS:-}" ] && [ -f "$console_jobs_file" ]; then
  CONSOLE_JOBS="$(cat "$console_jobs_file")"
fi
export CONSOLE_JOBS="${CONSOLE_JOBS:-on}"
role="$(server_role)"
case "$role" in
  all) profiles=(api-host console-host web) ;;
  api) profiles=(api-host) ;;
  console) profiles=(console-host) ;;
  *)
    echo "SERVER_ROLE in $settings_file is '$role': it must be all, api or console" >&2
    exit 1
    ;;
esac
# The server's own Postgres runs only while the settings point the database at it, and the migrations only where the
# settings hold the migrator's connection string.
if uses_local_database; then
  profiles+=(local-database)
fi
if runs_migrations; then
  profiles+=(migrations)
fi
COMPOSE_PROFILES="$(
  IFS=,
  echo "${profiles[*]}"
)"
export COMPOSE_PROFILES
exec docker compose --project-name travel-crm --file docker-compose.server.yml --env-file "$settings_file" "$@"
