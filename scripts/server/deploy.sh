#!/usr/bin/env bash
# Deploys the commit checked out in /srv/travel-crm/app (scripts/server/release.sh puts it there, docs/runbook.md):
# builds its two images (unless they're already on the server, as on a rollback), applies its migrations while the old
# release still serves, restarts the services on the new images, waits for every health check and runs the smoke
# check. The release before stays on the server for a rollback. As root:
#   sudo /srv/travel-crm/app/scripts/server/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/server/paths.sh

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

[ "$(id -u)" = 0 ] || fail "Run it as root (sudo)."
scripts/server/secrets.sh check >/dev/null || {
  scripts/server/secrets.sh check >&2 || true
  fail "settings above are still empty (scripts/server/secrets.sh set <NAME>)"
}
# The checkout belongs to the user who pushes; root reads it without taking it over.
commit="$(git -c safe.directory="$PWD" rev-parse HEAD)"
release="${commit:0:12}"
export RELEASE="$release"
compose() {
  scripts/server/compose.sh "$@"
}

if docker image inspect "travel-crm-api:$release" "travel-crm-web:$release" >/dev/null 2>&1; then
  echo "Release $release's images are already here: no build"
else
  echo "Building release $release (the first build takes a while)"
  compose build
fi

echo "Applying the migrations, as app_migrator, while the running release serves"
if uses_local_database; then
  compose up --detach --wait postgres
fi
compose run --rm migrate

echo "Starting release $release"
compose up --detach --wait --wait-timeout 300 --remove-orphans || {
  compose ps >&2
  compose logs --tail 50 >&2
  fail "release $release didn't come up healthy; roll back as docs/runbook.md says"
}

# The release before this one, kept for a rollback (docs/runbook.md).
if [ -f "$release_file" ] && [ "$(cat "$release_file")" != "$commit" ]; then
  cp "$release_file" "$previous_release_file"
fi
echo "$commit" >"$release_file"

if uses_local_database; then
  huge_pages="$(compose exec -T postgres psql --username postgres --tuples-only --no-align \
    --command 'SHOW huge_pages_status')"
  if [ "$huge_pages" != "on" ]; then
    echo "WARNING: Postgres runs without huge pages: check vm.nr_hugepages (scripts/server/setup.sh)" >&2
  fi
fi

# Old releases' images, but this one's and the one before's, and build cache older than two weeks.
keep_previous="$(cut -c 1-12 "$previous_release_file" 2>/dev/null || true)"
docker image ls --format '{{.Repository}}:{{.Tag}}' | grep -E '^travel-crm-(api|web):' |
  grep -v -E ":($release|${keep_previous:-none})\$" | xargs -r docker image rm >/dev/null || true
docker builder prune --force --filter until=336h >/dev/null || true

app_host="$(sed -n -E "s/^APP_HOST='(.*)'\$/\1/p" "$settings_file")"
scripts/server/smoke.sh "https://$app_host" --local
echo "Release $release is live at https://$app_host"
