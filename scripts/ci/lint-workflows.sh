#!/usr/bin/env bash
# `pnpm workflows:lint` (in CI's lint job): actionlint on the GitHub workflows, with ShellCheck on their `run:` steps,
# then ShellCheck on every shell script in the repository and on the git hooks, from one pinned image, so a laptop
# checks with the versions CI does.
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/docker/images.sh

# ShellCheck, with the options given, on the NUL-separated files read from stdin.
shellcheck_files() {
  xargs -0 docker run --rm --volume "$PWD:/repo:ro" --workdir /repo --entrypoint shellcheck "$actionlint_image" "$@"
}

docker run --rm --volume "$PWD:/repo:ro" --workdir /repo "$actionlint_image" -color
git ls-files -z -- "*.sh" | shellcheck_files --external-sources
# husky runs the hooks with sh, and they have no shebang to say so.
git ls-files -z -- ".husky/*" | shellcheck_files --shell=sh
echo "The workflows, the shell scripts and the git hooks are clean."
