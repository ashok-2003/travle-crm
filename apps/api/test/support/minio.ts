// Starts MinIO in a container for tests that need real object storage, with one empty bucket made by the image's own
// `mc` client (this package may not import the AWS SDK). MinIO no longer publishes images: this is the community
// build of the same server (ADR 0011).
import type { S3StorageSettings } from "@travel-crm/integrations/storage";
import { GenericContainer, Wait } from "testcontainers";

const IMAGE = "pgsty/minio:RELEASE.2026-08-04T00-00-00Z";
const USER = "minio-test";
const PASSWORD = "minio-test-password";

export interface TestMinio {
  settings: S3StorageSettings;
  stop(): Promise<void>;
}

export async function startMinio(bucket = "travel-crm-test"): Promise<TestMinio> {
  const container = await new GenericContainer(IMAGE)
    .withEnvironment({ MINIO_ROOT_USER: USER, MINIO_ROOT_PASSWORD: PASSWORD })
    .withCommand(["server", "/data"])
    .withExposedPorts(9000)
    .withWaitStrategy(Wait.forHttp("/minio/health/live", 9000))
    .start();
  const made = await container.exec([
    "sh",
    "-c",
    `mc alias set local http://localhost:9000 ${USER} ${PASSWORD} && mc mb local/${bucket}`,
  ]);
  if (made.exitCode !== 0) throw new Error(`Could not create the test bucket: ${made.output}`);
  return {
    settings: {
      endpoint: `http://${container.getHost()}:${String(container.getMappedPort(9000))}`,
      region: "ap-south-1",
      bucket,
      accessKeyId: USER,
      secretAccessKey: PASSWORD,
      forcePathStyle: true,
    },
    stop: async () => {
      await container.stop();
    },
  };
}
