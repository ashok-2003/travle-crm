// Object storage for the journeys' api: MinIO in a container, with one empty bucket made by the image's own `mc`
// client, as the api's own tests start it (apps/api/test/support/minio.ts, the same image pin). The api checks its
// bucket at start-up and refuses to run without one it can use. MinIO no longer publishes images: this is the
// community build of the same server (ADR 0011).
import { GenericContainer, Wait } from "testcontainers";

const IMAGE = "pgsty/minio:RELEASE.2026-08-04T00-00-00Z";
const USER = "minio-e2e";
const PASSWORD = "minio-e2e-password";
const BUCKET = "travel-crm-e2e";

/** The api's S3 settings for this MinIO, as its environment variables. */
export type StorageVariables = Record<
  "S3_ENDPOINT" | "S3_BUCKET" | "S3_ACCESS_KEY_ID" | "S3_SECRET_ACCESS_KEY" | "S3_FORCE_PATH_STYLE",
  string
>;

export interface Minio {
  variables: StorageVariables;
  stop(): Promise<void>;
}

export async function startMinio(): Promise<Minio> {
  const container = await new GenericContainer(IMAGE)
    .withEnvironment({ MINIO_ROOT_USER: USER, MINIO_ROOT_PASSWORD: PASSWORD })
    .withCommand(["server", "/data"])
    .withExposedPorts(9000)
    .withWaitStrategy(Wait.forHttp("/minio/health/live", 9000))
    .start();
  const stop = async () => {
    await container.stop();
  };
  const made = await container.exec([
    "sh",
    "-c",
    `mc alias set local http://localhost:9000 ${USER} ${PASSWORD} && mc mb local/${BUCKET}`,
  ]);
  if (made.exitCode !== 0) {
    await stop();
    throw new Error(`Could not create the journeys' bucket: ${made.output}`);
  }
  return {
    variables: {
      S3_ENDPOINT: `http://${container.getHost()}:${String(container.getMappedPort(9000))}`,
      S3_BUCKET: BUCKET,
      S3_ACCESS_KEY_ID: USER,
      S3_SECRET_ACCESS_KEY: PASSWORD,
      S3_FORCE_PATH_STYLE: "true",
    },
    stop,
  };
}
