#!/usr/bin/env bash
# Runs `docker compose` on the server (docker-compose.server.yml, docs/runbook.md) as the project travel-crm, with the
# server's settings (/srv/travel-crm/production.env, root's alone) and the release whose images run: RELEASE from the
# environment, else the one /srv/travel-crm/release names. Every server script comes through here. Run it as root:
#   sudo scripts/server/compose.sh ps
#   sudo scripts/server/compose.sh logs --tail 100 api
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
# The server's own Postgres runs only while the settings point the database at it.
if uses_local_database; then
  export COMPOSE_PROFILES=local-database
fi
exec docker compose --project-name travel-crm --file docker-compose.server.yml --env-file "$settings_file" "$@"
