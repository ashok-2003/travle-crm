#!/usr/bin/env bash
# Deploys a commit to the pilot server from this computer (docs/runbook.md). It pushes the commit over SSH to the
# server's own repository, checks it out there and runs scripts/server/deploy.sh, which builds, migrates, restarts
# and smoke-checks. The server needs no access to GitHub, and the first run makes its repository and checkout.
# A rollback is a release of the commit before (the server keeps its images, so nothing is built).
#   SERVER=ubuntu@<address> scripts/server/release.sh [--push-only] [<commit or branch>]     (main by default)
# --push-only puts the commit on the server without deploying it: the first time, before setup.sh has run.
# SSH_KEY says which key reaches the server (~/.ssh/travel-crm-oracle by default).
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/server/paths.sh

server="${SERVER:?set SERVER=ubuntu@<the server address>}"
key="${SSH_KEY:-$HOME/.ssh/travel-crm-oracle}"
push_only=""
if [ "${1:-}" = "--push-only" ]; then
  push_only="yes"
  shift
fi
commit="$(git rev-parse --verify "${1:-main}^{commit}")"
export GIT_SSH_COMMAND="ssh -i $key -o IdentitiesOnly=yes"
on_server() {
  ssh -i "$key" -o IdentitiesOnly=yes "$server" "$@"
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
else
  on_server "sudo $checkout/scripts/server/deploy.sh"
fi
