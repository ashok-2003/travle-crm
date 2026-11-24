#!/usr/bin/env bash
# Releases a commit to the two small servers (docs/runbook.md, "Two small servers"): when DATABASE_MIGRATOR_URL is
# given, it builds the api's image for this computer and applies the commit's migrations to the managed database with
# it, as a deploy's one-off `migrate` does; then it releases to the api's server and then the console's (or the
# database server's), each getting the image built for its architecture, stopping at the first failure. GitHub Actions
# runs it on every merge (.github/workflows/deploy.yml); the owner can run it from the Mac too.
#   API_SERVER=ubuntu@<ip> CONSOLE_SERVER=ubuntu@<ip> [DATABASE_MIGRATOR_URL=…] \
#     scripts/server/release-servers.sh [<commit or branch>]  (main by default)
# SSH_KEY says which key reaches the servers, as for release.sh.
set -euo pipefail
cd "$(dirname "$0")/../.."

api_server="${API_SERVER:?set API_SERVER=ubuntu@<the api server address>}"
console_server="${CONSOLE_SERVER:?set CONSOLE_SERVER=ubuntu@<the console server address>}"
commit="$(git rev-parse --verify "${1:-main}^{commit}")"
image="travel-crm-api:${commit:0:12}"

if [ -n "${DATABASE_MIGRATOR_URL:-}" ]; then
  echo "Applying the migrations of $(git rev-parse --short "$commit")"
  # They run here, so with an image of this computer's architecture.
  scripts/server/build-api-image.sh "$commit"
  # The URL reaches the container from this environment, never on a command line.
  docker run --rm --env DATABASE_MIGRATOR_URL --env PRISMA_HIDE_UPDATE_MESSAGE=1 "$image" migrate
else
  echo "No DATABASE_MIGRATOR_URL: no migrations applied (apply them first, as docs/serverless.md says)"
fi
SERVER="$api_server" scripts/server/release.sh --build-here "$commit"
SERVER="$console_server" scripts/server/release.sh --build-here "$commit"
