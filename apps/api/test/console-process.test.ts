// The console's own process, started as a deploy starts it: it reads its settings, checks the platform role, starts
// pg-boss and the platform's jobs, answers /health and the console's tRPC on CONSOLE_PORT, and exits 0 on SIGTERM; a
// connection that isn't the platform role stops it at start-up. Real Postgres and MinIO; SMTP is never reached.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer, type AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { testEnvironmentVariables } from "./support/environment.js";
import { startMinio, type TestMinio } from "./support/minio.js";

const apiDirectory = fileURLToPath(new URL("..", import.meta.url));

/** A port nothing listens on, for the console to take. */
async function freePort(): Promise<number> {
  const server = createServer().listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  server.close();
  await once(server, "close");
  return port;
}

interface ConsoleProcess {
  /** Everything it printed so far. */
  output(): string;
  hasExited(): boolean;
  exited: Promise<number | null>;
  stop(): void;
}

describe("the console process", () => {
  let minio: TestMinio;

  beforeAll(async () => {
    minio = await startMinio();
  });

  afterAll(async () => {
    await minio.stop();
  });

  /** `src/console.ts` in its own Node, with only the variables a deploy gives it: nothing of the test runner's. */
  function startConsole(port: number, overrides: Record<string, string> = {}): ConsoleProcess {
    const child = spawn(process.execPath, ["--import", "tsx", "src/console.ts"], {
      cwd: apiDirectory,
      env: {
        PATH: process.env.PATH,
        ...testEnvironmentVariables({
          DATABASE_PLATFORM_URL: inject("dbUrls").platform,
          DATABASE_POOL_SIZE: "2",
          CONSOLE_PORT: String(port),
          S3_ENDPOINT: minio.settings.endpoint ?? "",
          S3_BUCKET: minio.settings.bucket,
          S3_ACCESS_KEY_ID: minio.settings.accessKeyId,
          S3_SECRET_ACCESS_KEY: minio.settings.secretAccessKey,
          SMTP_HOST: "127.0.0.1",
          SMTP_PORT: "9",
          ...overrides,
        }),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let printed = "";
    child.stdout.on("data", (chunk: Buffer) => (printed += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (printed += chunk.toString()));
    const exited = once(child, "exit").then(([code]) => code as number | null);
    return {
      output: () => printed,
      hasExited: () => child.exitCode !== null,
      exited,
      stop: () => child.kill("SIGTERM"),
    };
  }

  it("starts, serves the console's tRPC, and exits 0 on SIGTERM", { timeout: 90_000 }, async () => {
    const port = await freePort();
    const running = startConsole(port);
    try {
      for (let attempt = 0; attempt < 600 && !running.output().includes("console listening"); attempt += 1) {
        if (running.hasExited()) throw new Error(`the console exited early:\n${running.output()}`);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(running.output()).toContain(`console listening on port ${String(port)}`);
      expect((await fetch(`http://127.0.0.1:${String(port)}/health`)).status).toBe(200);
      // Nobody signed in: the console's own check refuses.
      expect((await fetch(`http://127.0.0.1:${String(port)}/api/platform/trpc/whoAmI`)).status).toBe(401);
    } finally {
      running.stop();
    }
    expect(await running.exited).toBe(0);
  });

  it("refuses to start on a connection that isn't the platform role", { timeout: 90_000 }, async () => {
    const running = startConsole(await freePort(), { DATABASE_PLATFORM_URL: inject("dbUrls").migrator });
    expect(await running.exited).toBe(1);
    expect(running.output()).toMatch(/^console start-up failed WrongPlatformRoleError/m);
  });
});
