// Starts MinIO in a container for the storage adapter's tests, with one empty bucket. MinIO no longer publishes
// images, so this is the community build of the same server (ADR 0011).
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { GenericContainer, Wait } from "testcontainers";
import type { S3StorageSettings } from "../../src/storage/index.js";

export const MINIO_IMAGE = "pgsty/minio:RELEASE.2026-08-04T00-00-00Z";

const USER = "minio-test";
const PASSWORD = "minio-test-password";

export interface TestMinio {
  /** Settings for createS3Storage, pointing at the container's bucket. */
  settings: S3StorageSettings;
  stop(): Promise<void>;
}

export async function startMinio(bucket = "files"): Promise<TestMinio> {
  const container = await new GenericContainer(MINIO_IMAGE)
    .withEnvironment({ MINIO_ROOT_USER: USER, MINIO_ROOT_PASSWORD: PASSWORD })
    .withCommand(["server", "/data"])
    .withExposedPorts(9000)
    .withWaitStrategy(Wait.forHttp("/minio/health/live", 9000))
    .start();
  const endpoint = `http://${container.getHost()}:${String(container.getMappedPort(9000))}`;
  const settings: S3StorageSettings = {
    endpoint,
    region: "ap-south-1",
    bucket,
    accessKeyId: USER,
    secretAccessKey: PASSWORD,
    forcePathStyle: true,
  };
  const admin = new S3Client({
    endpoint,
    region: settings.region,
    forcePathStyle: true,
    credentials: { accessKeyId: USER, secretAccessKey: PASSWORD },
  });
  try {
    await admin.send(new CreateBucketCommand({ Bucket: bucket }));
  } finally {
    admin.destroy();
  }
  return {
    settings,
    stop: async () => {
      await container.stop();
    },
  };
}
