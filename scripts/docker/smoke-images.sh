#!/usr/bin/env bash
# `pnpm images:smoke` (spec 12.1, gate 7): builds the api's and the web app's images, then runs every command of the
# api's image as a deploy does (production settings, a read-only file system) against a throwaway Postgres, MinIO and
# Mailpit. Expects the api and the console to answer /health, the worker to render a PDF with the brand's fonts, the
# web app to serve /sign-in with its security headers and rewrite none of the api's paths, each process to stop on
# SIGTERM by itself, and neither image to hold a .env file. Everything it starts is removed again, however it ends. The
# images are tagged after this checkout's project (scripts/dev/compose.sh), so a run in another clone never retags
# this one's.
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/docker/images.sh
source scripts/docker/support.sh

prefix="$(scripts/dev/compose.sh --print-name)"
api_tag="$prefix-api:local"
web_tag="$prefix-web:local"
run="travel-crm-smoke-$$"
work="$(mktemp -d)"
cleanup() {
  docker ps --all --quiet --filter "label=$run" | xargs docker rm --force --volumes >/dev/null 2>&1 || true
  docker network rm "$run" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

echo "Building the images"
docker build --file apps/api/Dockerfile --tag "$api_tag" .
# A production build needs a storage origin for its CSP. Nothing here uploads, so the local one serves.
docker build --file apps/web/Dockerfile --build-arg STORAGE_ORIGIN=http://localhost:59000 --tag "$web_tag" .
# Neither image holds a .env from the checkout (.dockerignore): the web app's build reads them, and Next.js copies .env
# and .env.production beside its server. node_modules is skipped: what a package ships is not the checkout's.
for image in "$api_tag" "$web_tag"; do
  found="$(docker run --rm --entrypoint find "$image" /app -name node_modules -prune -o -name '.env*' \
    ! -name .env.example -print)"
  [ -z "$found" ] || fail "$image holds $found"
done
echo "ok: neither image holds a .env file"

docker network create "$run" >/dev/null
# A container of this run, on its network, removed by cleanup.
start() {
  local name="$1"
  shift
  docker run --detach --name "$run-$name" --label "$run" --network "$run" --network-alias "$name" "$@" >/dev/null
}
# The host port a container's port is published on (each is published on 127.0.0.1 alone).
port_of() {
  docker port "$run-$1" "$2" | sed -n '1s/.*://p'
}
# One value from the throwaway database, as its superuser.
query() {
  docker exec "$run-postgres" psql --username postgres --dbname travel_crm --tuples-only --no-align --command "$1"
}

echo "Starting Postgres (with bootstrap.sql's roles), MinIO and Mailpit"
start postgres --env POSTGRES_PASSWORD=postgres --env POSTGRES_DB=travel_crm --publish 127.0.0.1::5432 \
  --volume "$PWD/packages/db/sql/bootstrap.sql:/docker-entrypoint-initdb.d/10-bootstrap.sql:ro" "$postgres_image"
start minio --env MINIO_ROOT_USER=minio-dev --env MINIO_ROOT_PASSWORD=minio-dev-secret "$minio_image" server /data
start mailpit "$mailpit_image"
# Over TCP: while the image runs bootstrap.sql, Postgres listens on its socket only.
wait_until "Postgres starting" docker exec "$run-postgres" pg_isready --host 127.0.0.1 --username postgres
wait_until "MinIO starting" docker exec "$run-minio" mc alias set local http://localhost:9000 minio-dev minio-dev-secret
docker exec "$run-minio" mc mb --ignore-existing local/travel-crm >/dev/null

# Production settings, as a deploy sets them: https addresses, rate limiting, and a strong secret and a VAPID key pair
# made for this run (production refuses .env.example's).
secret="$(node --eval 'console.log(require("node:crypto").randomBytes(32).toString("base64"))')"
vapid="$(node --eval '
  const { privateKey } = require("node:crypto").generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const { x, y, d } = privateKey.export({ format: "jwk" });
  const point = Buffer.concat([Buffer.of(4), Buffer.from(x, "base64url"), Buffer.from(y, "base64url")]);
  console.log("VAPID_PUBLIC_KEY=" + point.toString("base64url") + "\nVAPID_PRIVATE_KEY=" + d);
')"
cat >"$work/api.env" <<EOF
NODE_ENV=production
DATABASE_URL=postgresql://app_runtime:runtime@postgres:5432/travel_crm
BETTER_AUTH_SECRET=$secret
BETTER_AUTH_URL=https://app.example.test
APP_URL=https://app.example.test
S3_ENDPOINT=http://minio:9000
S3_BUCKET=travel-crm
S3_ACCESS_KEY_ID=minio-dev
S3_SECRET_ACCESS_KEY=minio-dev-secret
S3_FORCE_PATH_STYLE=true
SMTP_HOST=mailpit
SMTP_PORT=1025
EMAIL_FROM_ADDRESS=no-reply@travel-crm.localhost
$vapid
VAPID_SUBJECT=mailto:ops@example.test
EOF
cp "$work/api.env" "$work/console.env"
cat >>"$work/console.env" <<EOF
DATABASE_PLATFORM_URL=postgresql://app_platform:platform@postgres:5432/travel_crm
DEMO_ORGANIZATION_CODE=DEMO
DEMO_PASSWORD=demo-only-password
EOF
# The api's image, read-only like a container platform's, with a scratch /tmp for Node.
api_image() {
  docker run --label "$run" --network "$run" --read-only --tmpfs /tmp "$@"
}

echo "migrate, first-super-admin and demo, once each"
api_image --rm --env DATABASE_MIGRATOR_URL=postgresql://app_migrator:migrator@postgres:5432/travel_crm \
  "$api_tag" migrate | tee "$work/migrate.log"
grep --quiet "All migrations have been successfully applied" "$work/migrate.log" || fail "migrate applied nothing"
password="$(api_image --rm --env-file "$work/console.env" "$api_tag" \
  first-super-admin --email ops@example.test --name "Smoke Admin")"
[ -n "$password" ] || fail "first-super-admin printed no temporary password"
echo "ok: first-super-admin made the first super admin"
api_image --rm --env-file "$work/console.env" "$api_tag" demo | grep --fixed-strings "The demo is ready" ||
  fail "demo didn't build the demo"

echo "api, console and worker"
api_image --detach --name "$run-api" --env-file "$work/api.env" --publish 127.0.0.1::3001 \
  "$api_tag" >/dev/null
api_image --detach --name "$run-console" --env-file "$work/console.env" --publish 127.0.0.1::3002 \
  "$api_tag" console >/dev/null
api_image --detach --name "$run-worker" --env-file "$work/api.env" "$api_tag" worker >/dev/null
wait_for_status "http://127.0.0.1:$(port_of api 3001)/health" 200 "$run-api"
echo "ok: the api answers /health"
wait_for_status "http://127.0.0.1:$(port_of console 3002)/health" 200 "$run-console"
echo "ok: the console answers /health"
wait_for_log "$run-worker" "worker running"

echo "The worker renders a PDF with the brand's fonts"
organization="$(query "SELECT id FROM organization WHERE code = 'DEMO'")"
document="$(DATABASE_URL="postgresql://app_runtime:runtime@127.0.0.1:$(port_of postgres 5432)/travel_crm" \
  ORGANIZATION_ID="$organization" pnpm --filter @travel-crm/api-server exec tsx scripts/issue-sample-document.ts)"
attachment=""
for _ in $(seq 1 60); do
  attachment="$(query "SELECT pdf_attachment_id FROM issued_document WHERE id = '$document'")"
  [ -n "$attachment" ] && break
  sleep 0.5
done
[ -n "$attachment" ] || fail "the worker didn't render the document's PDF"
docker exec "$run-minio" mc cat "local/travel-crm/organizations/$organization/attachments/$attachment" \
  >"$work/sample.pdf"
for font in EBGaramond Figtree IBMPlexMono; do
  grep --quiet --text "/FontName /[A-Z]*+$font" "$work/sample.pdf" || fail "the PDF doesn't embed $font"
done
echo "ok: the PDF embeds EB Garamond, Figtree and IBM Plex Mono"

echo "web"
docker run --detach --name "$run-web" --label "$run" --read-only --tmpfs /tmp --publish 127.0.0.1::3000 \
  "$web_tag" >/dev/null
web="http://127.0.0.1:$(port_of web 3000)"
wait_for_status "$web/sign-in" 200 "$run-web"
curl --silent --fail --dump-header "$work/headers" --output /dev/null "$web/sign-in"
expect_header "$work/headers" Content-Security-Policy "default-src 'self'"
expect_header "$work/headers" Content-Security-Policy "frame-ancestors 'none'"
expect_header "$work/headers" Strict-Transport-Security "max-age=63072000; includeSubDomains"
expect_header "$work/headers" X-Content-Type-Options nosniff
expect_header "$work/headers" X-Frame-Options DENY
expect_header "$work/headers" Referrer-Policy strict-origin-when-cross-origin
expect_header "$work/headers" Cross-Origin-Opener-Policy same-origin
expect_header "$work/headers" Permissions-Policy "camera=()"
grep --quiet --ignore-case "^x-powered-by:" "$work/headers" && fail "the web app says what it runs on"
echo "ok: /sign-in carries the security headers"
# A production build rewrites nothing (next.config.ts): the load balancer sends the console's api, the api, share links
# and the webhook intake elsewhere, so a request for any of them that reaches the app is its own 404.
expect_status "$web/api/platform/trpc/whoAmI" 404
expect_status "$web/api/trpc/me.get" 404
expect_status "$web/p/not-a-token" 404
expect_status "$web/webhooks/not-a-provider" 404 --request POST --header "Content-Type: application/json" --data "{}"

echo "SIGTERM"
for name in api console worker; do
  stop_gracefully "$run-$name"
done
# Next.js's server closes on SIGTERM itself and then exits 143 (128 + SIGTERM), on purpose.
stop_gracefully "$run-web" 143
echo "The images are good."
