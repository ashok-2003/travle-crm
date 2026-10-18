# How much memory Postgres's shared buffers get on this server: a quarter of it, in MB. secrets.sh writes it as
# POSTGRES_SHARED_BUFFERS (docker-compose.server.yml) and setup.sh reserves huge pages for it, so the two always agree
# for the server's size (docs/runbook.md, "Resize the server"). Sourced by those scripts, never run.
# shellcheck shell=bash

postgres_shared_buffers_mb() {
  awk '/^MemTotal:/ { printf "%d", $2 / 1024 / 4 }' /proc/meminfo
}
