# The backups' R2 bucket, reached with rclone in its pinned image (scripts/docker/images.sh). Sourced by backup.sh and
# restore-check.sh after they've read the server's settings, never run.
# (rclone_image comes from scripts/docker/images.sh, S3_ENDPOINT and the BACKUP_* settings from the settings file.)
# shellcheck shell=bash disable=SC2154

# rclone with the backup bucket as the remote "r2:" and the given folder mounted at /backup. The token goes in through
# the environment, never on a command line another user could read in `ps`.
rclone_backups() {
  local folder="$1"
  shift
  RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare RCLONE_CONFIG_R2_ENDPOINT="$S3_ENDPOINT" \
    RCLONE_CONFIG_R2_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID" \
    RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY" \
    docker run --rm --volume "$folder:/backup" \
    --env RCLONE_CONFIG_R2_TYPE --env RCLONE_CONFIG_R2_PROVIDER --env RCLONE_CONFIG_R2_ENDPOINT \
    --env RCLONE_CONFIG_R2_ACCESS_KEY_ID --env RCLONE_CONFIG_R2_SECRET_ACCESS_KEY \
    --env RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true \
    "$rclone_image" "$@"
}
