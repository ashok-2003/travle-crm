#!/usr/bin/env bash
# Deploys a commit to the pilot server from this computer (docs/runbook.md). It pushes the commit over SSH to the
# server's own repository, checks it out there and runs scripts/server/deploy.sh, which builds, migrates, restarts
# and smoke-checks. The server needs no access to GitHub, and the first run makes its repository and checkout.
# A rollback is a release of the commit before (the server keeps its images, so nothing is built).
#   SERVER=ubuntu@<address> scripts/server/release.sh [--push-only] [--build-here] [<commit or branch>]  (main by default)
# --push-only puts the commit on the server without deploying it: the first time, before setup.sh has run.
# --build-here builds the api's image on this computer, for the server's linux/amd64, from the commit as git has it
# (not the working tree), and loads it onto the server, for the two small servers, which are too small to build it
# (docs/runbook.md, "Two small servers"). The image stays here, so releasing the same commit to the other server only
# loads it.
# SSH_KEY says which key reaches the server (~/.ssh/travel-crm-oracle by default).
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/server/paths.sh

server="${SERVER:?set SERVER=ubuntu@<the server address>}"
key="${SSH_KEY:-$HOME/.ssh/travel-crm-oracle}"
push_only=""
build_here=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --push-only) push_only="yes" ;;
    --build-here) build_here="yes" ;;
    *) break ;;
  esac
  shift
done
commit="$(git rev-parse --verify "${1:-main}^{commit}")"
export GIT_SSH_COMMAND="ssh -i $key -o IdentitiesOnly=yes"
on_server() {
  ssh -i "$key" -o IdentitiesOnly=yes "$server" "$@"
}

# Builds travel-crm-api:<release> for linux/amd64 unless this computer has it already, and loads it onto the server
# unless the server has it already. The release is the commit's first 12 characters, as deploy.sh names it.
bring_api_image() {
  local image="travel-crm-api:${commit:0:12}" source
  if [ "$(docker image inspect --format '{{.Architecture}}' "$image" 2>/dev/null || true)" != amd64 ]; then
    echo "Building $image for linux/amd64 on this computer (the first build takes a while)"
    source="$(mktemp -d)"
    # shellcheck disable=SC2064 # the directory is known now, and removed however the script ends
    trap "rm -rf '$source'" EXIT
    git archive "$commit" | tar -x -C "$source"
    docker buildx build --platform linux/amd64 --file "$source/apps/api/Dockerfile" --tag "$image" --load "$source"
  fi
  if on_server "sudo docker image inspect $image >/dev/null 2>&1"; then
    echo "$image is already on $server"
  else
    echo "Loading $image onto $server"
    docker save "$image" | gzip -1 | on_server "gunzip | sudo docker load --quiet"
  fi
}

echo "Releasing $(git log -1 --format='%h %s' "$commit") to $server"
on_server "test -d $repository || {
  sudo install -d -m 0755 $server_root &&
  sudo install -d -o \"\$(id -un)\" -g \"\$(id -gn)\" $repository $checkout &&
  git init --quiet --bare $repository &&
  git clone --quiet $repository $checkout 2>/dev/null
}"
# Forced, so a rollback to an older commit is a push like any other.
git push --quiet "$server:$repository" "+$commit:refs/heads/deploy"
on_server "git -C $checkout fetch --quiet origin && git -C $checkout checkout --quiet --detach $commit"
if [ -n "$push_only" ]; then
  echo "$(git rev-parse --short "$commit") is checked out on the server, not deployed."
  exit 0
fi
if [ -n "$build_here" ]; then
  bring_api_image
fi
on_server "sudo $checkout/scripts/server/deploy.sh"
