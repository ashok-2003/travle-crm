// The console's own process, started as a deploy starts it: it reads its settings, checks the platform role, starts
// pg-boss and the platform's jobs, answers /health and the console's tRPC on CONSOLE_PORT, and exits 0 on SIGTERM; a
// connection that isn't the platform role stops it at start-up. Its one-off command for the first super admin starts
// the same way and prints the temporary password alone on stdout. Real Postgres and MinIO; SMTP is never reached.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer, type AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { createIsolatedDatabase } from "@travel-crm/db/testing";
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
  /** What it printed on stdout alone. */
  stdout(): string;
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

  /** A script and its arguments in its own Node, with only the variables a deploy gives it: none of the runner's. */
  function startScript(script: readonly string[], overrides: Record<string, string> = {}): ConsoleProcess {
    const child = spawn(process.execPath, ["--import", "tsx", ...script], {
      cwd: apiDirectory,
      env: {
        PATH: process.env.PATH,
        ...testEnvironmentVariables({
          DATABASE_PLATFORM_URL: inject("dbUrls").platform,
          DATABASE_POOL_SIZE: "2",
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
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => {
      printed += chunk.toString();
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => (printed += chunk.toString()));
    const exited = once(child, "exit").then(([code]) => code as number | null);
    return {
      output: () => printed,
      stdout: () => stdout,
      hasExited: () => child.exitCode !== null,
      exited,
      stop: () => child.kill("SIGTERM"),
    };
  }

  /** `src/console.ts`, the console process. */
  const startConsole = (port: number, overrides: Record<string, string> = {}) =>
    startScript(["src/console.ts"], { CONSOLE_PORT: String(port), ...overrides });

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

  it(
    "runs the first-super-admin command once, printing the temporary password alone",
    { timeout: 90_000 },
    async () => {
      // A database of its own, where no super admin exists yet.
      const database = await createIsolatedDatabase(inject("dbUrls"));
      const firstSuperAdmin = (email: string) =>
        startScript(["src/console-command.ts", "first-super-admin", "--", "--email", email, "--name", "First Admin"], {
          DATABASE_URL: database.urls.runtime,
          DATABASE_PLATFORM_URL: database.urls.platform,
        });
      try {
        const first = firstSuperAdmin("first@platform.test");
        expect(await first.exited).toBe(0);
        expect(first.stdout()).toMatch(/^[\w-]{24}\n$/);
        expect(first.output()).toBe(first.stdout());
        const second = firstSuperAdmin("second@platform.test");
        expect(await second.exited).toBe(1);
        expect(second.output()).toBe("A super admin exists already: they add everyone else from the console.\n");
      } finally {
        await database.drop();
      }
    },
  );

  it("names its commands when given another, before starting anything", { timeout: 30_000 }, async () => {
    const unknown = startScript(["src/console-command.ts", "make-tea"]);
    expect(await unknown.exited).toBe(1);
    expect(unknown.output()).toBe("Usage: console-command <first-super-admin | demo> [arguments]\n");
  });
});
