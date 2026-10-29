#!/usr/bin/env bash
# Deploys the commit checked out in /srv/travel-crm/app (scripts/server/release.sh puts it there, docs/runbook.md):
# builds its images (unless they're already on the server, as on a rollback), applies its migrations while the old
# release still serves, restarts the services on the new images, waits for every health check and runs the smoke
# check. The release before stays on the server for a rollback. As root:
#   sudo /srv/travel-crm/app/scripts/server/deploy.sh
# On the two small servers (SERVER_ROLE `api` or `console`) only the api's image runs, release.sh brings it ready made
# (they're too small to build it), the migrations run only where DATABASE_MIGRATOR_URL is set, and after the smoke
# check the working hours put the worker and the console's jobs back as the time calls for: stopped, or off, at night
# outside a burst (scripts/server/work-hours.sh).
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
  fail "settings above are still empty, or one is set that mustn't be (scripts/server/secrets.sh set <NAME>)"
}
# The checkout belongs to the user who pushes; root reads it without taking it over.
commit="$(git -c safe.directory="$PWD" rev-parse HEAD)"
release="${commit:0:12}"
export RELEASE="$release"
role="$(server_role)"
compose() {
  scripts/server/compose.sh "$@"
}

images=("travel-crm-api:$release")
if [ "$role" = all ]; then
  images+=("travel-crm-web:$release")
fi
if docker image inspect "${images[@]}" >/dev/null 2>&1; then
  echo "Release $release's images are already here: no build"
elif [ "$role" = all ]; then
  echo "Building release $release (the first build takes a while)"
  compose build
else
  fail "travel-crm-api:$release isn't here, and this server is too small to build it: release it with" \
    "scripts/server/release.sh --build-here, which builds it on your computer and loads it here"
fi

if runs_migrations; then
  echo "Applying the migrations, as app_migrator, while the running release serves"
  if uses_local_database; then
    compose up --detach --wait postgres
  fi
  compose run --rm migrate
else
  echo "No migrations here (no DATABASE_MIGRATOR_URL): release $release's are applied before it (docs/runbook.md)"
fi

echo "Starting release $release"
# The api writes its wake-up signal for the worker in this folder (scripts/server/work-hours.sh): made before the api
# starts, as the api's user's, so Docker doesn't make it root's.
install -d -o "$api_user_id" -g "$api_user_id" -m 0755 "$(dirname "$work_signal_file")"
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
# The address people use (APP_URL), which the api's sign-in takes requests from; this server's own when blank.
app_url="$(sed -n -E "s/^APP_URL='(.*)'\$/\1/p" "$settings_file")"
SERVER_ROLE="$role" ORIGIN="${app_url:-https://$app_host}" scripts/server/smoke.sh "https://$app_host" --local
# The smoke check needs the worker or the console up, whatever the time. Then the working hours write their timers for
# this release's script and put each back as the time calls for (the night's state outside the hours and the bursts).
scripts/server/work-hours.sh apply
echo "Release $release is live at https://$app_host"
