#!/usr/bin/env bash
# Makes, once, on the owner's own computer, every secret the serverless pilot makes for itself (docs/serverless.md),
# and the SQL that gives a managed Postgres the product's three roles: packages/db/sql/bootstrap.sql with strong
# passwords. It prints them and stores or sends nothing; keep the output in a password manager, run the SQL in the
# database's SQL editor, and paste the settings into Render.
#   scripts/serverless/setup-values.sh <database host> [<database name>]
# The host is the database's direct one, not a pooler's (Neon: ep-…-123456.ap-southeast-1.aws.neon.tech, without
# -pooler): pg-boss and the migrations need a session of their own.
set -euo pipefail
cd "$(dirname "$0")/../.."

host="${1:?Usage: setup-values.sh <database host> [<database name>]}"
database="${2:-travel_crm}"

# 64 hex characters without three alike in a row, which Neon refuses in a password (it wants 60 bits and no runs).
password() {
  local candidate
  while :; do
    candidate="$(openssl rand -hex 32)"
    grep -q -E '(.)\1\1' <<<"$candidate" || break
  done
  echo "$candidate"
}
migrator="$(password)"
runtime="$(password)"
platform="$(password)"

# bootstrap.sql as it is, with the passwords put in, CREATEDB (only `prisma migrate dev` needs it) left out, and the
# admin made a member of app_migrator just before handing it the database: a managed database's admin isn't a
# superuser, and may give a database only to a role it can become.
self_grant="GRANT app_migrator TO CURRENT_USER WITH INHERIT TRUE, SET TRUE;"
sql="$(sed -E \
  -e "s/PASSWORD 'migrator' NOBYPASSRLS CREATEDB/PASSWORD '$migrator' NOBYPASSRLS/" \
  -e "s/PASSWORD 'runtime'/PASSWORD '$runtime'/" \
  -e "s/PASSWORD 'platform'/PASSWORD '$platform'/" \
  -e "s/^(DO .*ALTER DATABASE %I OWNER TO app_migrator.*)$/$self_grant\n\1/" \
  packages/db/sql/bootstrap.sql)"
for expected in "$migrator" "$runtime" "$platform" "$self_grant"; do
  grep -q -F "$expected" <<<"$sql" || {
    echo "packages/db/sql/bootstrap.sql has changed: update setup-values.sh to match it" >&2
    exit 1
  }
done

# Web push's VAPID pair as web-push makes it (scripts/server/secrets.sh does the same on a server).
vapid="$(node --eval '
  const { generateKeyPairSync } = require("node:crypto");
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const point = publicKey.export({ format: "jwk" });
  const x = Buffer.from(point.x, "base64url");
  const y = Buffer.from(point.y, "base64url");
  console.log(Buffer.concat([Buffer.from([4]), x, y]).toString("base64url"));
  console.log(privateKey.export({ format: "jwk" }).d);
')"
url() {
  echo "postgresql://$1:$2@$host/$database?sslmode=require"
}

cat <<EOF
== 1. Run this SQL once, connected to the database "$database" as its owner (Neon: neondb_owner, in the SQL Editor)

$sql

== 2. Settings for Render (docs/serverless.md says which service takes which)

DATABASE_URL=$(url app_runtime "$runtime")
DATABASE_PLATFORM_URL=$(url app_platform "$platform")
DATABASE_MIGRATOR_URL=$(url app_migrator "$migrator")
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
VAPID_PUBLIC_KEY=$(sed -n 1p <<<"$vapid")
VAPID_PRIVATE_KEY=$(sed -n 2p <<<"$vapid")

Keep all of it in your password manager: the VAPID pair is for good (a new pair drops every browser's push
subscription), and BETTER_AUTH_SECRET, changed, signs everyone out.
EOF
