#!/usr/bin/env bash
# `pnpm scripts:test`: the compose helper (scripts/dev/compose.sh) gives two checkouts two project names, even in
# folders of the same name, and the same checkout the same name each time; COMPOSE_PROJECT_NAME wins, from the
# environment over .env, where a commented-out line counts for nothing; the product's name adds -product. It asks for
# names only, so no container is started.
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
echo "The compose helper names each checkout's project."
