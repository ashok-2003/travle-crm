// Where a presigned upload goes, as an origin, for the trip page's content security policy: the S3-compatible server's own
// address when one is set (MinIO, R2), else the region's S3 host for the bucket.
export function storageOriginOf(settings: {
  S3_ENDPOINT?: string | undefined;
  S3_BUCKET: string;
  S3_REGION: string;
  S3_FORCE_PATH_STYLE: boolean;
}): string {
  if (settings.S3_ENDPOINT !== undefined) return new URL(settings.S3_ENDPOINT).origin;
  return settings.S3_FORCE_PATH_STYLE
    ? `https://s3.${settings.S3_REGION}.amazonaws.com`
    : `https://${settings.S3_BUCKET}.s3.${settings.S3_REGION}.amazonaws.com`;
}
