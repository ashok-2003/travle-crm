#!/usr/bin/env bash
# `pnpm product:smoke` (spec 2.7): brings the whole product up in Docker (docker-compose.product.yml) as a project of
# its own on free ports, uses it through the proxy as a browser does, and removes it with its data, however it ends.
# Expects the proxy to route as the load balancer will and to pass the web app's security headers on once each, mail
# and files to be readable where the README says, the demo to build, and the demo's Owner to sign in.
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/docker/support.sh

# A project of its own, never this checkout's product (whose data the cleanup's `down --volumes` would drop), with
# the images tagged as this checkout's (scripts/dev/compose.sh), so a run in another clone never retags them.
IMAGE_PREFIX="$(scripts/dev/compose.sh --print-name)"
export IMAGE_PREFIX COMPOSE_PROJECT_NAME="travel-crm-product-smoke-$$"
PRODUCT_PORT="$(free_port)"
PRODUCT_MAIL_PORT="$(free_port)"
PRODUCT_STORAGE_PORT="$(free_port)"
PRODUCT_STORAGE_CONSOLE_PORT="$(free_port)"
export PRODUCT_PORT PRODUCT_MAIL_PORT PRODUCT_STORAGE_PORT PRODUCT_STORAGE_CONSOLE_PORT
work="$(mktemp -d)"
compose() {
  docker compose --file docker-compose.product.yml "$@"
}
cleanup() {
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

echo "Building and starting the product"
compose up --detach --build --wait --wait-timeout 300 || {
  compose logs >&2
  fail "the product didn't come up"
}

app="http://localhost:$PRODUCT_PORT"
echo "Routes, as the load balancer will have them"
expect_status "$app/sign-in" 200 --dump-header "$work/sign-in"
expect_header "$work/sign-in" Content-Security-Policy "default-src 'self'"
expect_header "$work/sign-in" Strict-Transport-Security "max-age=63072000; includeSubDomains"
echo "ok: the web app's Content-Security-Policy and HSTS come through the proxy once each"
expect_status "$app/health" 200
# The console answers its own api: the api has no /api/platform and would say 404.
expect_status "$app/api/platform/trpc/whoAmI" 401
expect_status "$app/api/trpc/me.get" 401
# Share links and the webhook intake are the api's: only its 404 for a link says no-referrer (the web app's says
# strict-origin-when-cross-origin), and only it refuses an unknown provider's webhook in JSON.
expect_status "$app/p/not-a-token" 404 --dump-header "$work/share-link"
expect_header "$work/share-link" Referrer-Policy no-referrer
expect_status "$app/webhooks/not-a-provider" 404 --request POST --header "Content-Type: application/json" --data "{}" \
  --dump-header "$work/webhook"
expect_header "$work/webhook" Content-Type application/json
echo "Mail and files"
expect_status "http://localhost:$PRODUCT_MAIL_PORT/" 200
# Where presigned links point, from this computer as from the containers.
expect_status "http://storage.localhost:$PRODUCT_STORAGE_PORT/minio/health/live" 200

echo "The demo, and its Owner signing in through the proxy"
compose run --rm --no-deps console demo | tee "$work/demo.log"
grep --quiet "The demo is ready" "$work/demo.log" || fail "the demo wasn't built"
signed_in="$(curl --silent --output /dev/null --write-out "%{http_code}" --cookie-jar "$work/cookies" \
  --header "Origin: $app" --header "Content-Type: application/json" \
  --data '{"orgCode":"DEMO","username":"asha","password":"demo-only-password"}' "$app/api/auth/sign-in/org")"
[ "$signed_in" = "200" ] || fail "the demo's Owner couldn't sign in: $signed_in"
curl --silent --fail --cookie "$work/cookies" --output "$work/me.json" "$app/api/trpc/me.get" ||
  fail "me.get refused the Owner's session"
grep --quiet --fixed-strings '"name":"Asha Mehta"' "$work/me.json" || fail "me.get doesn't name the demo's Owner"
echo "ok: the demo's Owner signed in, and me.get knows her"
echo "The product is good."
