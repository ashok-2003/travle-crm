#!/usr/bin/env bash
# Builds the api's image, travel-crm-api:<release>, for linux/amd64 from a commit as git has it (not the working tree),
# unless this computer has that image already. The release is the commit's first 12 characters, as deploy.sh names it.
# release.sh --build-here and release-servers.sh use it, for the two small servers, which are too small to build it
# (docs/runbook.md, "Two small servers").
#   scripts/server/build-api-image.sh [<commit or branch>]  (main by default)
set -euo pipefail
cd "$(dirname "$0")/../.."

commit="$(git rev-parse --verify "${1:-main}^{commit}")"
image="travel-crm-api:${commit:0:12}"
if [ "$(docker image inspect --format '{{.Architecture}}' "$image" 2>/dev/null || true)" = amd64 ]; then
  echo "$image is already here"
  exit 0
fi
echo "Building $image for linux/amd64 on this computer (the first build takes a while)"
source="$(mktemp -d)"
# shellcheck disable=SC2064 # the directory is known now, and removed however the script ends
trap "rm -rf '$source'" EXIT
git archive "$commit" | tar -x -C "$source"
docker buildx build --platform linux/amd64 --file "$source/apps/api/Dockerfile" --tag "$image" --load "$source"
