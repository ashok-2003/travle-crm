#!/usr/bin/env bash
# Runs `docker compose` under this checkout's own project name, so a second clone or worktree never recreates the
# first's containers or touches its volumes. Every script that runs Compose comes through here:
#   scripts/dev/compose.sh <arguments>              the development services (docker-compose.yml)
#   scripts/dev/compose.sh --product <arguments>    the whole product (docker-compose.product.yml)
#   scripts/dev/compose.sh [--product] --print-name the project's name, without running Compose
# The name is COMPOSE_PROJECT_NAME from the environment or .env, else travel-crm-<the checksum of the checkout's full
# path> (a folder's name is not enough: scratch clones are called travel-crm too); the product's adds -product. Both
# stacks' images are tagged after the first name (IMAGE_PREFIX): <name>-api:local and <name>-web:local. Both compose
# files need IMAGE_PREFIX, so plain `docker compose`, which would name the project after the folder, refuses them.
set -euo pipefail
cd "$(dirname "$0")/../.."

name="${COMPOSE_PROJECT_NAME:-}"
if [ -z "$name" ] && [ -f .env ]; then
  # The last COMPOSE_PROJECT_NAME line, as Compose reads it: without CRs, `export `, an inline ` # comment` or quotes.
  name="$(tr -d '\r' <.env | sed -n -E 's/^[[:space:]]*(export[[:space:]]+)?COMPOSE_PROJECT_NAME=//p' | tail -n 1 |
    sed -E 's/[[:space:]]+#.*$//; s/[[:space:]]+$//' | tr -d "\"'")"
fi
[ -n "$name" ] || name="travel-crm-$(pwd -P | cksum | cut -d ' ' -f 1)"

product=""
if [ "${1:-}" = "--product" ]; then
  product="-product"
  shift
fi
export COMPOSE_PROJECT_NAME="$name$product" IMAGE_PREFIX="$name"
if [ "${1:-}" = "--print-name" ]; then
  echo "$COMPOSE_PROJECT_NAME"
elif [ -n "$product" ]; then
  exec docker compose --file docker-compose.product.yml "$@"
else
  exec docker compose "$@"
fi
