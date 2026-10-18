#!/bin/sh
# Postgres's last init step on the server (docker-compose.server.yml), after packages/db/sql/bootstrap.sql: gives the
# three roles the strong passwords from the server's settings in place of bootstrap.sql's local ones, and takes back
# CREATEDB, which only `prisma migrate dev`'s shadow database needs. The image runs it once, when the database is made.
set -eu

psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set migrator="$MIGRATOR_DB_PASSWORD" \
  --set runtime="$RUNTIME_DB_PASSWORD" --set platform="$PLATFORM_DB_PASSWORD" <<'SQL'
ALTER ROLE app_migrator PASSWORD :'migrator' NOCREATEDB;
ALTER ROLE app_runtime PASSWORD :'runtime';
ALTER ROLE app_platform PASSWORD :'platform';
SQL
