#!/usr/bin/env bash
# Builds the api's image, travel-crm-api:<release>, for an architecture (amd64 or arm64; this computer's by default)
# from a commit as git has it (not the working tree), unless this computer has that image for it already. The release
# is the commit's first 12 characters, as deploy.sh names it. release.sh --build-here and release-servers.sh use it, for
# the small servers, which don't build it themselves (docs/runbook.md, "Two small servers"). Another architecture than
# this computer's builds under emulation, which Docker Desktop has and GitHub's runners don't, so there the runner is
# the api server's architecture (.github/workflows/deploy.yml).
#   scripts/server/build-api-image.sh [<commit or branch>] [amd64|arm64]  (main by default)
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/server/paths.sh

commit="$(git rev-parse --verify "${1:-main}^{commit}")"
architecture="$(docker_architecture "${2:-$(uname -m)}")"
image="travel-crm-api:${commit:0:12}"
if [ "$(docker image inspect --format '{{.Architecture}}' "$image" 2>/dev/null || true)" = "$architecture" ]; then
  echo "$image is already here, for linux/$architecture"
  exit 0
fi
echo "Building $image for linux/$architecture on this computer (the first build takes a while)"
source="$(mktemp -d)"
# shellcheck disable=SC2064 # the directory is known now, and removed however the script ends
trap "rm -rf '$source'" EXIT
git archive "$commit" | tar -x -C "$source"
docker buildx build --platform "linux/$architecture" --file "$source/apps/api/Dockerfile" --tag "$image" --load "$source"
