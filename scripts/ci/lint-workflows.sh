#!/usr/bin/env bash
# `pnpm workflows:lint` (in CI's lint job): actionlint on the GitHub workflows, with ShellCheck on their `run:` steps,
# then ShellCheck on every shell script in the repository, from one pinned image, so a laptop checks with the
# versions CI does.
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/docker/images.sh

docker run --rm --volume "$PWD:/repo:ro" --workdir /repo "$actionlint_image" -color
git ls-files -z -- "*.sh" |
  xargs -0 docker run --rm --volume "$PWD:/repo:ro" --workdir /repo --entrypoint shellcheck "$actionlint_image" \
    --external-sources
echo "The workflows and the shell scripts are clean."
