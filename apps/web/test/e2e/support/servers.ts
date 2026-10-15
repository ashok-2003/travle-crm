// Starts the real api and the built web app for the journeys, on free ports, the way a deployment runs them: the
// api from its source with tsx, the web app as Next.js's standalone server. The web app is built here, because its
// /api rewrite is fixed at build time and must point at this api.
import { spawn } from "node:child_process";
import { cp } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";

const webDirectory = path.resolve(import.meta.dirname, "../../..");
const apiDirectory = path.resolve(webDirectory, "../api");

/** A port nothing listens on now. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("no port"));
      });
    });
  });
}

/** Runs a command to the end, failing with its output if it fails. */
function run(command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed with ${String(code)}:\n${output}`));
    });
  });
}

/** Starts a long-running process. Its output is shown only if it stops before stop() is called. */
function start(command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }) {
  const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  let stopping = false;
  child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
  child.once("exit", (code) => {
    if (!stopping) console.error(`${command} stopped early with ${String(code)}:\n${output}`);
  });
  return {
    stop: () => {
      stopping = true;
      child.kill();
    },
  };
}

/** Waits until url answers 200, for up to a minute. */
async function waitUntilUp(url: string): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${url} didn't come up within a minute`);
}

export interface Servers {
  webUrl: string;
  stop(): void;
}

export async function startServers({ databaseUrl }: { databaseUrl: string }): Promise<Servers> {
  const [apiPort, webPort] = [await freePort(), await freePort()];
  const webUrl = `http://127.0.0.1:${String(webPort)}`;

  const api = start(path.join(apiDirectory, "node_modules/.bin/tsx"), ["src/server.ts"], {
    cwd: apiDirectory,
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(apiPort),
      DATABASE_URL: databaseUrl,
      BETTER_AUTH_SECRET: "e2e-only-secret-".padEnd(48, "x"),
      // Browsers reach the api through the web app's address (spec 3), so that is its URL and the trusted origin.
      BETTER_AUTH_URL: webUrl,
      APP_URL: webUrl,
      TRUSTED_ORIGINS: "",
      // Journeys sign in many times from one address.
      AUTH_RATE_LIMIT: "false",
      // Plan 3's services are configured from the environment; the journeys send no email and store no files.
      S3_BUCKET: "e2e",
      S3_ACCESS_KEY_ID: "e2e",
      S3_SECRET_ACCESS_KEY: "e2e-secret",
      S3_ENDPOINT: "http://127.0.0.1:9",
      S3_FORCE_PATH_STYLE: "true",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "9",
      EMAIL_FROM_ADDRESS: "no-reply@travel-crm.localhost",
      VAPID_PUBLIC_KEY: "BNDwagd-1gwbRjL1o3iP9g4zUvYkczzP1yE9xNbcidEzKkDbvrHaBCyHQi8btoNnI9IMV7CoQun_1oMlSCz5lTY",
      VAPID_PRIVATE_KEY: "UrS7-d1PFp4TPIVRSD5qGMXmRPN_NbpYvsJxhc6j3nU",
      VAPID_SUBJECT: "mailto:dev@travel-crm.localhost",
    },
  });

  await run(path.join(webDirectory, "node_modules/.bin/next"), ["build"], {
    cwd: webDirectory,
    env: { ...process.env, API_ORIGIN: `http://127.0.0.1:${String(apiPort)}` },
  });
  // The standalone server serves .next/static and public only when they sit beside it, as a Docker image puts them.
  const standalone = path.join(webDirectory, ".next/standalone/apps/web");
  await cp(path.join(webDirectory, ".next/static"), path.join(standalone, ".next/static"), { recursive: true });
  await cp(path.join(webDirectory, "public"), path.join(standalone, "public"), { recursive: true });
  const web = start(process.execPath, ["server.js"], {
    cwd: standalone,
    env: { ...process.env, NODE_ENV: "production", PORT: String(webPort), HOSTNAME: "127.0.0.1" },
  });

  await waitUntilUp(`http://127.0.0.1:${String(apiPort)}/health`);
  await waitUntilUp(webUrl);
  return {
    webUrl,
    stop: () => {
      api.stop();
      web.stop();
    },
  };
}
