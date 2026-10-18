#!/usr/bin/env bash
# The live smoke check (docs/runbook.md): asks the product at its https address what browsers and the outside world
# do: the certificate and the http redirect, the routes as docs/deploy-checklist.md has them, the web app's security
# headers coming through once, and the sign-in rate limit refusing a burst of wrong passwords. From any computer:
#   scripts/server/smoke.sh https://<host>
# deploy.sh adds --local on the server: the same requests, sent to this server's Caddy whatever DNS says. Where the
# address doesn't route /health to the api (Vercel, docs/serverless.md), HEALTH_URL names the api's own.
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/docker/support.sh

app="${1:?Usage: smoke.sh https://<host> [--local]}"
host="${app#https://}"
# Extra curl arguments for every request.
curl_options=(--connect-timeout 10)
if [ "${2:-}" = "--local" ]; then
  curl_options+=(--resolve "$host:443:127.0.0.1" --resolve "$host:80:127.0.0.1")
fi
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "HTTPS, with a certificate curl trusts"
expect_status "http://$host/sign-in" 308 "${curl_options[@]}"
expect_status "${HEALTH_URL:-$app/health}" 200 "${curl_options[@]}"

echo "Routes, as docs/deploy-checklist.md has them"
expect_status "$app/sign-in" 200 --dump-header "$work/sign-in" "${curl_options[@]}"
expect_header "$work/sign-in" Content-Security-Policy "default-src 'self'"
expect_header "$work/sign-in" Strict-Transport-Security "max-age=63072000; includeSubDomains"
echo "ok: the web app's Content-Security-Policy and HSTS come through once each"
# The console answers its own api: the api has no /api/platform and would say 404.
expect_status "$app/api/platform/trpc/whoAmI" 401 "${curl_options[@]}"
expect_status "$app/api/trpc/me.get" 401 "${curl_options[@]}"
# Only the api's 404 for a share link says no-referrer, and only it refuses an unknown provider's webhook in JSON.
expect_status "$app/p/not-a-token" 404 --dump-header "$work/share-link" "${curl_options[@]}"
expect_header "$work/share-link" Referrer-Policy no-referrer
expect_status "$app/webhooks/not-a-provider" 404 --request POST --header "Content-Type: application/json" --data "{}" \
  --dump-header "$work/webhook" "${curl_options[@]}"
expect_header "$work/webhook" Content-Type application/json

# Sign-in is password-only for the pilot, so the limit must hold: a burst of wrong passwords from one address is
# refused with 429 within a few tries (Better Auth's sign-in rule, per client address).
echo "Sign-in rate limiting"
limited=""
for attempt in 1 2 3 4 5 6; do
  status="$(status_of "$app/api/auth/sign-in/org" --request POST --header "Origin: $app" \
    --header "Content-Type: application/json" \
    --data '{"orgCode":"SMOKE","username":"smoke-check","password":"not-the-password"}' "${curl_options[@]}")"
  case "$status" in
    429)
      limited="$attempt"
      break
      ;;
    401) ;;
    *) fail "a wrong password got $status, not 401 (or 429 once limited)" ;;
  esac
done
[ -n "$limited" ] || fail "six wrong passwords in a row were never refused with 429: is AUTH_RATE_LIMIT on?"
echo "ok: wrong password number $limited was refused with 429"
echo "The live product is good."
