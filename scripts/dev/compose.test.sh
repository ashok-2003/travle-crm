#!/usr/bin/env bash
# `pnpm scripts:test`: the compose helper (scripts/dev/compose.sh) gives two checkouts two project names, even in
# folders of the same name, and the same checkout the same name each time; COMPOSE_PROJECT_NAME wins, from the
# environment over .env, read as Compose reads it (a commented-out line counts for nothing; `export `, quotes, an
# inline comment and CRLF line ends are not part of the name); the product's name adds -product; and plain
# `docker compose` refuses both compose files. It asks for names and configurations only: no container is started.
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/docker/support.sh

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
# Two checkouts whose folders are both called travel-crm, as scratch clones are.
one="$work/one/travel-crm"
two="$work/two/travel-crm"
for checkout in "$one" "$two"; do
  mkdir -p "$checkout/scripts/dev"
  cp scripts/dev/compose.sh "$checkout/scripts/dev/"
done
# The name the helper gives, from a checkout, with an environment of nothing but the arguments' variables.
name_of() {
  local checkout="$1"
  shift
  env -i PATH="$PATH" "$@" "$checkout/scripts/dev/compose.sh" --print-name
}
product_name_of() {
  env -i PATH="$PATH" "$1/scripts/dev/compose.sh" --product --print-name
}
expect_name() {
  local what="$1" actual="$2" expected="$3"
  [ "$actual" = "$expected" ] || fail "$what: \"$actual\", not \"$expected\""
  echo "ok: $what"
}

first="$(name_of "$one")"
case "$first" in travel-crm-[0-9]*) ;; *) fail "a checkout's name is \"$first\", not travel-crm-<checksum>" ;; esac
expect_name "the same checkout gets the same name" "$(name_of "$one")" "$first"
[ "$(name_of "$two")" != "$first" ] || fail "two checkouts both got \"$first\""
echo "ok: two checkouts in folders of the same name get two names"
expect_name "the product's name adds -product" "$(product_name_of "$one")" "$first-product"

expect_name "COMPOSE_PROJECT_NAME in the environment wins" "$(name_of "$one" COMPOSE_PROJECT_NAME=mine)" mine
# .env.example's line, commented out, as a copy of it has it.
printf '# COMPOSE_PROJECT_NAME=travel-crm\n' >"$one/.env"
expect_name "a commented-out COMPOSE_PROJECT_NAME is no name" "$(name_of "$one")" "$first"
printf 'NODE_ENV=development\nCOMPOSE_PROJECT_NAME="travel-crm"\n' >"$one/.env"
expect_name "COMPOSE_PROJECT_NAME in .env wins" "$(name_of "$one")" travel-crm
expect_name "the product's name adds -product to .env's" "$(product_name_of "$one")" travel-crm-product
expect_name "the environment wins over .env" "$(name_of "$one" COMPOSE_PROJECT_NAME=mine)" mine
printf 'export COMPOSE_PROJECT_NAME=exported\n' >"$one/.env"
expect_name "an exported COMPOSE_PROJECT_NAME is read without its export" "$(name_of "$one")" exported
printf 'COMPOSE_PROJECT_NAME=commented # the old containers\n' >"$one/.env"
expect_name "an inline comment is no part of the name" "$(name_of "$one")" commented
printf "COMPOSE_PROJECT_NAME='quoted' # the old containers\n" >"$one/.env"
expect_name "a quoted name before an inline comment is read without either" "$(name_of "$one")" quoted
printf 'COMPOSE_PROJECT_NAME=windows\r\nNODE_ENV=development\r\n' >"$one/.env"
expect_name "a CRLF line end is no part of the name" "$(name_of "$one")" windows

# Plain `docker compose` (which would name the project after the folder) refuses both files; the helper doesn't.
for file in docker-compose.yml docker-compose.product.yml; do
  refusal="$(env -u IMAGE_PREFIX docker compose --project-name "compose-test-$$" --file "$file" config 2>&1 >/dev/null ||
    true)"
  case "$refusal" in
    *"required variable IMAGE_PREFIX is missing"*) ;;
    *) fail "plain docker compose doesn't refuse $file: ${refusal:-it ran}" ;;
  esac
done
COMPOSE_PROJECT_NAME="compose-test-$$" scripts/dev/compose.sh config --quiet ||
  fail "the helper's development services don't load"
COMPOSE_PROJECT_NAME="compose-test-$$" scripts/dev/compose.sh --product config --quiet ||
  fail "the helper's product doesn't load"
echo "ok: plain docker compose refuses both compose files, and the helper loads them"
echo "The compose helper names each checkout's project."
