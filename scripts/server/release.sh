#!/usr/bin/env bash
# Deploys a commit to the pilot server from this computer (docs/runbook.md). It pushes the commit over SSH to the
# server's own repository, checks it out there and runs scripts/server/deploy.sh, which builds, migrates, restarts
# and smoke-checks. The server needs no access to GitHub, and the first run makes its repository and checkout.
# A rollback is a release of the commit before (the server keeps its images, so nothing is built).
#   SERVER=ubuntu@<address> scripts/server/release.sh [--push-only] [--build-here] [<commit or branch>]  (main by default)
# --push-only puts the commit on the server without deploying it: the first time, before setup.sh has run.
# --build-here builds the api's image on this computer, for the server's architecture (amd64, or arm64 on an Ampere
# A1), from the commit as git has it (not the working tree), and loads it onto the server, for the small servers, which
# don't build it themselves (docs/runbook.md, "Two small servers"). The image stays here, so releasing the same commit
# to another server of that architecture only loads it.
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

# Builds travel-crm-api:<release> for the server's architecture unless this computer has it already
# (build-api-image.sh), and loads it onto the server unless the server has it already. The release is the commit's
# first 12 characters, as deploy.sh names it. A database server of another architecture than this computer's gets
# none: Postgres alone runs there, and building for it would mean emulation, which GitHub's runners lack. Its restore
# drill then needs an image brought by hand (docs/runbook.md, "Backups and restoring").
bring_api_image() {
  local image="travel-crm-api:${commit:0:12}" architecture
  architecture="$(docker_architecture "$(on_server uname -m)")"
  if [ "$architecture" != "$(docker_architecture "$(uname -m)")" ] &&
    [ "$(on_server "sudo bash -c 'source $checkout/scripts/server/paths.sh && server_role'")" = database ]; then
    echo "$server runs Postgres alone, on $architecture: it gets no image of the api's"
    return
  fi
  scripts/server/build-api-image.sh "$commit" "$architecture"
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
