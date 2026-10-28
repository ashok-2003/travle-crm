#!/usr/bin/env bash
# The server's settings and secrets (/srv/travel-crm/production.env, read by scripts/server/compose.sh). Every secret
# the product makes for itself is made here, on the server, and never leaves it; the file is root's alone (0600) and
# never in git. Values are written single-quoted, so Compose reads them as they are (a `$` is not a variable).
# Run it as root:
#   secrets.sh init <app host> <acme email> [all|api|console]
#                                            makes the file once: the database passwords, the auth secret and the
#                                            web push key pair, and blanks for what the owner's accounts give. The
#                                            role is what the server runs (docs/runbook.md, "Two small servers");
#                                            `api` and `console` use a managed database, so init leaves the
#                                            connection strings blank
#   secrets.sh set <NAME>                    sets one value, typed without echo (or read from stdin)
#   secrets.sh fill                          asks for every setting still empty, in turn
#   secrets.sh check                         names every setting still empty, never a value
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/server/paths.sh
source scripts/docker/images.sh
source scripts/server/postgres-memory.sh

fail() {
  echo "$*" >&2
  exit 1
}

# The value a setting has now, without its quotes; empty when it's blank or missing.
value_of() {
  sed -n -E "s/^$1='(.*)'\$/\1/p" "$settings_file" | tail -n 1
}

# Writes one setting in place, keeping the file's mode. Values may hold anything but a single quote or a newline.
write_setting() {
  local name="$1" value="$2"
  case "$value" in *"'"* | *$'\n'*) fail "$name can't hold a single quote or a newline" ;; esac
  grep -q -E "^$name=" "$settings_file" || fail "$name isn't a setting in $settings_file"
  NAME="$name" VALUE="$value" awk '
    index($0, ENVIRON["NAME"] "=") == 1 { print ENVIRON["NAME"] "=\047" ENVIRON["VALUE"] "\047"; next }
    { print }
  ' "$settings_file" >"$settings_file.new"
  chmod 600 "$settings_file.new"
  mv "$settings_file.new" "$settings_file"
}

# Sets a setting only when it's still empty, so running init again never replaces a secret in use.
fill_once() {
  [ -n "$(value_of "$1")" ] || write_setting "$1" "$2"
}

# Web push's VAPID pair as web-push makes it: the P-256 public point uncompressed and the private scalar, both
# base64url. Made once and never replaced: every browser's push subscription is tied to the public key.
vapid_pair() {
  docker run --rm "$node_image" node --eval '
    const { generateKeyPairSync } = require("node:crypto");
    const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const point = publicKey.export({ format: "jwk" });
    const x = Buffer.from(point.x, "base64url");
    const y = Buffer.from(point.y, "base64url");
    console.log(Buffer.concat([Buffer.from([4]), x, y]).toString("base64url"));
    console.log(privateKey.export({ format: "jwk" }).d);
  '
}

init() {
  local host="${1:-}" acme_email="${2:-}" role="${3:-all}"
  [ -n "$host" ] && [ -n "$acme_email" ] || fail "Usage: secrets.sh init <app host> <acme email> [all|api|console]"
  case "$role" in all | api | console) ;; *) fail "The role is all, api or console, not '$role'" ;; esac
  umask 077
  mkdir -p "$server_root"
  [ -f "$settings_file" ] || cat >"$settings_file" <<'EOF'
# The server's settings for docker-compose.server.yml (scripts/server/secrets.sh, docs/runbook.md). Root's alone:
# never copy it off the server, print it or commit it.

# What this server runs: `all` (one server), or one of the two small servers, `api` (the api and the worker) or
# `console` (the console alone), whose web app is hosted elsewhere (docs/runbook.md, "Two small servers").
SERVER_ROLE=''
# The server's own address, which Caddy gets the certificate for. Changing it is the switch to a real domain
# (docs/runbook.md).
APP_HOST=''
# The address people use, when it isn't https://APP_HOST: the web app's, on the two small servers. Blank: APP_HOST's.
APP_URL=''
# The certificate authority's account: expiry warnings, and ZeroSSL's account when Let's Encrypt refuses.
ACME_EMAIL=''

# The database: one connection string per role (docs/deploy-checklist.md, "The database"). init points them at the
# server's own Postgres (the host `postgres`). For a managed Postgres 18, set all three, the migrator's connected
# directly rather than through a transaction pooler, and DATABASE_ADMIN_URL, a role that bypasses row-level security,
# for the backups (docs/runbook.md, "Use a managed database"). A small plan may need a smaller DATABASE_POOL_SIZE.
# On the two small servers: the api's never holds DATABASE_PLATFORM_URL, and neither needs the migrator's, which leaves
# the migrations to the owner's computer, before each release.
DATABASE_URL=''
DATABASE_PLATFORM_URL=''
DATABASE_MIGRATOR_URL=''
DATABASE_ADMIN_URL=''
DATABASE_POOL_SIZE='10'
# How long a transaction may wait for a connection and run, in milliseconds (blank: 2000 and 5000). A managed database
# that sleeps when idle, or is far away, may need more (docs/runbook.md, "Two small servers").
DATABASE_TRANSACTION_MAX_WAIT_MS=''
DATABASE_TRANSACTION_TIMEOUT_MS=''
# How often the worker and the console look for work, in seconds (blank: every 2).
JOBS_POLLING_SECONDS=''

# The server's own Postgres: its superuser's and the three roles' passwords, and its shared buffers, a quarter of the
# server's memory (all made by init; docs/runbook.md, "Resize the server").
POSTGRES_PASSWORD=''
MIGRATOR_DB_PASSWORD=''
RUNTIME_DB_PASSWORD=''
PLATFORM_DB_PASSWORD=''
POSTGRES_SHARED_BUFFERS=''

# Signs and encrypts sessions; one value for the api, the worker and the console (made by init).
BETTER_AUTH_SECRET=''

# Files: a private Cloudflare R2 bucket, path-style. S3_ENDPOINT is https://<account id>.r2.cloudflarestorage.com.
S3_ENDPOINT=''
S3_BUCKET='travel-crm-files'
S3_ACCESS_KEY_ID=''
S3_SECRET_ACCESS_KEY=''

# Email: Brevo's SMTP relay, STARTTLS on 587. EMAIL_FROM_ADDRESS is a sender Brevo has verified.
SMTP_HOST='smtp-relay.brevo.com'
SMTP_PORT='587'
SMTP_USER=''
SMTP_PASSWORD=''
EMAIL_FROM_ADDRESS=''

# Google Sheets (docs/runbook.md, "Turn on Google Sheets"). The key is made by init and never changed. The accounts are
# the service account key file as base64 on one line (`base64 -w0 key.json`), set with `secrets.sh set`; blank leaves
# Google Sheets off, and `check` does not ask for it.
SHEETS_HASH_KEY=''
GOOGLE_SHEETS_SERVICE_ACCOUNTS=''

# Meta lead ads (docs/deploy-checklist.md, "Meta lead ads"): all five or none, set with `secrets.sh set`; blank leaves it off,
# and `check` does not ask for them. META_TOKEN_KEY seals the Pages' tokens: `openssl rand -base64 32`, and never changed
# casually (a list, newest first, when it is). META_WEBHOOK_VERIFY_TOKEN is 32+ random characters.
META_APP_ID=''
META_APP_SECRET=''
META_WEBHOOK_VERIFY_TOKEN=''
META_LOGIN_CONFIG_ID=''
META_TOKEN_KEY=''
# WhatsApp through MSG91 (ADR 0035): all three or none. MSG91_AUTHKEY is from MSG91 (Settings, API keys); the other two are
# random, `openssl rand -hex 32` each.
MSG91_AUTHKEY=''
MSG91_WEBHOOK_TOKEN=''
MSG91_WEBHOOK_KEY=''
# Suggest reply's AI (docs/deploy-checklist.md, "Suggest reply"): an OpenRouter key and the models it tries (slugs, comma
# separated, each with a zero-data-retention endpoint); blank leaves it off, and `check` does not ask for them.
OPENROUTER_API_KEY=''
AI_SUGGEST_MODELS=''
AI_SCORE_MODELS=''

# Logs (docs/runbook.md, "Reading logs" and "Turn on Axiom"). LOG_LEVEL is debug, info, warn or error (blank: info).
# The token and dataset ship every log line to Axiom too; blank leaves it off, and `check` does not ask for them.
# AXIOM_URL is only for the EU region: https://api.eu.axiom.co.
LOG_LEVEL=''
AXIOM_TOKEN=''
AXIOM_DATASET=''
AXIOM_URL=''

# The website form (docs/deploy-checklist.md). Caddy replaces X-Forwarded-For with one address, so the hop count stays blank
# here. Turnstile's two keys are both or neither (docs/serverless.md has the Cloudflare steps); blank leaves the check off,
# and `check` does not ask for them.
PUBLIC_FORM_PROXY_HOPS=''
TURNSTILE_SITE_KEY=''
TURNSTILE_SECRET_KEY=''

# Web push: one pair for good (made by init); a new pair silently drops every browser's subscription.
VAPID_PUBLIC_KEY=''
VAPID_PRIVATE_KEY=''
VAPID_SUBJECT=''

# Backups (scripts/server/backup.sh): their own R2 bucket and token, and the age public key they're encrypted to.
# The private key is the owner's alone and never on this server.
BACKUP_S3_BUCKET='travel-crm-backups'
BACKUP_S3_ACCESS_KEY_ID=''
BACKUP_S3_SECRET_ACCESS_KEY=''
BACKUP_AGE_RECIPIENT=''
# Optional: an address the backup calls after it succeeds, so a monitor alerts on a missed night.
BACKUP_HEARTBEAT_URL=''
EOF
  chmod 600 "$settings_file"
  fill_once SERVER_ROLE "$role"
  fill_once APP_HOST "$host"
  fill_once ACME_EMAIL "$acme_email"
  fill_once VAPID_SUBJECT "mailto:$acme_email"
  fill_once POSTGRES_SHARED_BUFFERS "$(postgres_shared_buffers_mb)MB"
  # Hex, so a password needs no escaping in a postgresql:// URL.
  local name
  for name in POSTGRES_PASSWORD MIGRATOR_DB_PASSWORD RUNTIME_DB_PASSWORD PLATFORM_DB_PASSWORD; do
    fill_once "$name" "$(openssl rand -hex 32)"
  done
  fill_once BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
  # Never changed: the sheets' claims and an erased customer's tombstones are keyed with it.
  fill_once SHEETS_HASH_KEY "$(openssl rand -base64 32)"
  # One server starts on its own Postgres; the two small servers' managed database is the owner's to set.
  if [ "$(value_of SERVER_ROLE)" = all ]; then
    local local_database="@postgres:5432/travel_crm"
    fill_once DATABASE_URL "postgresql://app_runtime:$(value_of RUNTIME_DB_PASSWORD)$local_database"
    fill_once DATABASE_PLATFORM_URL "postgresql://app_platform:$(value_of PLATFORM_DB_PASSWORD)$local_database"
    fill_once DATABASE_MIGRATOR_URL "postgresql://app_migrator:$(value_of MIGRATOR_DB_PASSWORD)$local_database"
  fi
  if [ -z "$(value_of VAPID_PUBLIC_KEY)" ]; then
    local pair
    pair="$(vapid_pair)"
    write_setting VAPID_PUBLIC_KEY "$(sed -n 1p <<<"$pair")"
    write_setting VAPID_PRIVATE_KEY "$(sed -n 2p <<<"$pair")"
  fi
  echo "Made $settings_file. Still to set:"
  check || true
}

# One value, typed without echo when there's a terminal, else a line from stdin; printed for the caller.
ask() {
  local value=""
  if [ -t 0 ]; then
    read -r -s -p "$1: " value
    echo >&2
  else
    IFS= read -r value || true
  fi
  printf '%s' "$value"
}

set_one() {
  local name="${1:-}" value
  [ -n "$name" ] || fail "Usage: secrets.sh set <NAME>"
  [ -f "$settings_file" ] || fail "No $settings_file yet: run secrets.sh init first"
  value="$(ask "$name")"
  [ -n "$value" ] || fail "$name not changed: no value given"
  write_setting "$name" "$value"
  echo "Set $name."
}

# The settings still empty, one per line, but the optional ones: the heartbeat, and the admin connection string the
# server's own Postgres doesn't need, the Google service accounts, which leave Google Sheets off while blank, Meta's and
# MSG91's, which leave them off while blank, the log settings, which leave Axiom off while blank, the website form's,
# which are blank unless the owner turns Turnstile on, and those with a default (APP_URL, the transactions' limits, the
# jobs' polling). On the two small servers also the migrator's connection string (the migrations run from the owner's
# computer) and the backups' settings (the managed database is backed up from GitHub Actions), and on the api's the
# platform role's, which it must never hold.
empty_settings() {
  local optional='BACKUP_HEARTBEAT_URL|DATABASE_ADMIN_URL|GOOGLE_SHEETS_SERVICE_ACCOUNTS|META_[A-Z_]+|MSG91_[A-Z_]+'
  optional+='|LOG_LEVEL|AXIOM_TOKEN|AXIOM_DATASET|AXIOM_URL|PUBLIC_FORM_PROXY_HOPS|TURNSTILE_SITE_KEY|TURNSTILE_SECRET_KEY'
  optional+='|APP_URL|DATABASE_TRANSACTION_MAX_WAIT_MS|DATABASE_TRANSACTION_TIMEOUT_MS|JOBS_POLLING_SECONDS'
  case "$(server_role)" in
    api) optional+='|DATABASE_MIGRATOR_URL|BACKUP_[A-Z0-9_]+|DATABASE_PLATFORM_URL' ;;
    console) optional+='|DATABASE_MIGRATOR_URL|BACKUP_[A-Z0-9_]+' ;;
  esac
  sed -n -E "s/^([A-Z0-9_]+)=''\$/\1/p" "$settings_file" | grep -v -x -E "$optional" || true
}

# Asks for every empty setting in turn; one left empty is skipped.
fill() {
  [ -f "$settings_file" ] || fail "No $settings_file yet: run secrets.sh init first"
  local name value
  for name in $(empty_settings); do
    value="$(ask "$name")"
    if [ -n "$value" ]; then
      write_setting "$name" "$value"
    else
      echo "Skipped $name."
    fi
  done
  check
}

# Names every empty setting; fails when there is one, or when the api's small server holds the platform role's
# connection string, which sees every organization and belongs on the console's server alone.
check() {
  [ -f "$settings_file" ] || fail "No $settings_file yet: run secrets.sh init first"
  local missing name
  if [ "$(server_role)" = api ] && [ -n "$(value_of DATABASE_PLATFORM_URL)" ]; then
    echo "  DATABASE_PLATFORM_URL is set on the api's server: blank it (it belongs on the console's alone)"
    return 1
  fi
  missing="$(empty_settings)"
  if [ -n "$missing" ]; then
    while IFS= read -r name; do echo "  $name"; done <<<"$missing"
    return 1
  fi
  echo "Every setting is filled."
}

[ "$(id -u)" = 0 ] || fail "Run it as root (sudo)."
command="${1:-}"
if [ "$#" -gt 0 ]; then shift; fi
case "$command" in
  init) init "$@" ;;
  set) set_one "$@" ;;
  fill) fill ;;
  check) check ;;
  *) fail "Usage: secrets.sh <init <app host> <acme email> [all|api|console] | set <NAME> | fill | check>" ;;
esac
