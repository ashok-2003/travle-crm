// The console's start-up check of the platform role's connection (ADR 0019): besides being app_platform, the role must
// be able to step into an organization as app_runtime, which a hosted database allows only once it is granted. Without
// the grant the console refuses to start, rather than start healthy and fail every step later. A Postgres of its own,
// as the grant is the cluster's: taking it away from the shared test database would fail every other test file.
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startConsolePlatform } from "../src/console-platform.js";
import type { Services } from "../src/services.js";
import { testEnvironment } from "./support/environment.js";

const PASSWORD = "postgres-test-password";

describe("the console's start-up check", () => {
  let postgres: StartedTestContainer;

  beforeAll(async () => {
    postgres = await new GenericContainer("postgres:18-alpine")
      .withEnvironment({ POSTGRES_PASSWORD: PASSWORD })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .start();
    // The roles of sql/bootstrap.sql, without the grant that lets the platform role switch to the runtime role.
    await psql("CREATE ROLE app_runtime LOGIN PASSWORD 'runtime' NOBYPASSRLS");
    await psql("CREATE ROLE app_platform LOGIN PASSWORD 'platform' NOBYPASSRLS");
  });

  afterAll(async () => {
    await postgres.stop();
  });

  async function psql(sql: string): Promise<void> {
    const ran = await postgres.exec(["psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-c", sql]);
    if (ran.exitCode !== 0) throw new Error(`psql failed: ${ran.output}`);
  }

  /** The console's platform start, on this Postgres as app_platform. Services the check never uses. */
  function start() {
    const url = `postgresql://app_platform:platform@${postgres.getHost()}:${String(postgres.getMappedPort(5432))}/postgres`;
    vi.stubEnv("DATABASE_PLATFORM_URL", url);
    vi.stubEnv("DEMO_ORGANIZATION_CODE", undefined);
    vi.stubEnv("DEMO_PASSWORD", undefined);
    const services = { db: {}, identity: {}, storage: {}, jobs: {} } as unknown as Services;
    return startConsolePlatform({ environment: testEnvironment(), services, log: () => undefined });
  }

  it("refuses to start when the platform role can't step into an organization, and starts once it can", async () => {
    try {
      await expect(start()).rejects.toMatchObject({
        name: "OrganizationStepRefusedError",
        message: expect.stringContaining("GRANT app_runtime TO app_platform WITH INHERIT FALSE, SET TRUE") as string,
      });
      await psql("GRANT app_runtime TO app_platform WITH INHERIT FALSE, SET TRUE");
      const started = await start();
      await started.platform.platformDb.disconnect();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
