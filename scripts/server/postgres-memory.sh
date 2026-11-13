# How much memory Postgres's shared buffers get on this server: a quarter of it, in MB. secrets.sh writes it as
# POSTGRES_SHARED_BUFFERS (docker-compose.server.yml) and setup.sh reserves huge pages for it, so the two always agree
# for the server's size (docs/runbook.md, "Resize the server"). Sourced by those scripts, never run.
# shellcheck shell=bash

postgres_shared_buffers_mb() {
  awk '/^MemTotal:/ { printf "%d", $2 / 1024 / 4 }' /proc/meminfo
}

# For a server that runs Postgres alone (SERVER_ROLE `database`), what the planner may count on the page cache holding
# (three quarters of the memory) and what each maintenance task (a vacuum, an index build) may use (a sixteenth, at
# most 256 MB), in MB: Compose's defaults (4 GB and 256 MB) are for the one big server.
postgres_effective_cache_mb() {
  awk '/^MemTotal:/ { printf "%d", $2 / 1024 * 3 / 4 }' /proc/meminfo
}
postgres_maintenance_work_mb() {
  awk '/^MemTotal:/ { mb = $2 / 1024 / 16; if (mb > 256) mb = 256; printf "%d", mb }' /proc/meminfo
}
