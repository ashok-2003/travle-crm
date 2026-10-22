// The api, the worker and the console each end on an error nothing handled (an unhandled rejection) as they end on
// SIGTERM, but exiting 1: one line in the process's log, by name, code and frames, never the error's message, which Node's
// default would print in full; then the process's own drain. Real Postgres (a database of this file's
// own, as the worker relays and the console runs jobs) and MinIO; SMTP is never reached.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer, type AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { createIsolatedDatabase, type IsolatedDatabase } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { testEnvironmentVariables } from "./support/environment.js";
import { startMinio, type TestMinio } from "./support/minio.js";

const apiDirectory = fileURLToPath(new URL("..", import.meta.url));

/**
 * Loaded into the process before its own code (node --import): on SIGUSR2 it leaves a promise rejected with nothing to
 * handle it, as a bug would, with an error that quotes a person's data.
 */
const rejectOnSignal = `data:text/javascript,${encodeURIComponent(
  'process.on("SIGUSR2", () => { void Promise.reject(new Error("asha@example.test could not be reached")); });',
)}`;

/** A port nothing listens on, for a process to take. */
async function freePort(): Promise<number> {
  const server = createServer().listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  server.close();
  await once(server, "close");
  return port;
}

describe("a process's last resort", () => {
  let minio: TestMinio;
  let database: IsolatedDatabase;

  beforeAll(async () => {
    minio = await startMinio();
    database = await createIsolatedDatabase(inject("dbUrls"));
  });

  afterAll(async () => {
    await database.drop();
    await minio.stop();
  });

  /**
   * Starts `script` as a deploy does, with the test's rejection loaded first, waits until it says `ready`, then has it
   * reject a promise nothing handles. Gives back its exit code and everything it printed.
   */
  async function rejectedIn(script: string, ready: string): Promise<{ code: number | null; output: string }> {
    const port = String(await freePort());
    const child = spawn(process.execPath, ["--import", "tsx", "--import", rejectOnSignal, script], {
      cwd: apiDirectory,
      env: {
        PATH: process.env.PATH,
        ...testEnvironmentVariables({
          DATABASE_URL: database.urls.runtime,
          DATABASE_PLATFORM_URL: database.urls.platform,
          DATABASE_POOL_SIZE: "2",
          PORT: port,
          CONSOLE_PORT: port,
          S3_ENDPOINT: minio.settings.endpoint ?? "",
          S3_BUCKET: minio.settings.bucket,
          S3_ACCESS_KEY_ID: minio.settings.accessKeyId,
          S3_SECRET_ACCESS_KEY: minio.settings.secretAccessKey,
          SMTP_HOST: "127.0.0.1",
          SMTP_PORT: "9",
        }),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    const exited = once(child, "exit").then(([code]) => code as number | null);
    for (let attempt = 0; attempt < 600 && !output.includes(ready); attempt += 1) {
      if (child.exitCode !== null) throw new Error(`${script} exited early:\n${output}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    child.kill("SIGUSR2");
    return { code: await exited, output };
  }

  it.each([
    ["api", "src/server.ts", "api listening"],
    ["worker", "src/worker.ts", "worker running"],
    ["console", "src/console.ts", "console listening"],
  ])(
    "logs the %s's unhandled rejection by name and frames, not its message, drains and exits 1",
    { timeout: 90_000 },
    async (name, script, ready) => {
      const { code, output } = await rejectedIn(script, ready);
      expect(code).toBe(1);
      const line = output.split("\n").find((candidate) => candidate.includes('"msg":"unhandled rejection"'));
      expect(JSON.parse(line ?? "{}")).toMatchObject({
        level: "error",
        process: name,
        msg: "unhandled rejection",
        errorName: "Error",
      });
      expect(output).not.toContain("asha@example.test");
    },
  );
});
