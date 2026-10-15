# The images the scripts start beside ours, pinned by tag and digest, one per line, so Renovate updates them
# (renovate.json's custom manager). Sourced by the scripts, never run.
# shellcheck shell=bash disable=SC2034
postgres_image="postgres:18.6-alpine3.24@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873"
minio_image="pgsty/minio:RELEASE.2026-08-04T00-00-00Z@sha256:b6bfe7239bfc83fb90d31612d9704d86039dd714f7904b3f1ad68f211e602372"
mailpit_image="axllent/mailpit:v1.31.5@sha256:94f6b70c1436defae6799d9ac7ff0eeff9540465b842026d5cdb018f1c0234ea"
