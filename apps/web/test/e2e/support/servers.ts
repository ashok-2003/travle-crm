// Starts the real api and the built web app for the journeys, on free ports, the way a deployment runs them: the
// api from its source with tsx, the web app as Next.js's standalone server. The web app is built here, because its
// /api rewrite is fixed at build time and must point at this api. If anything fails on the way, whatever already
// started is stopped again, so a failed run leaves no process behind.
import { spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { cp } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import path from "node:path";

const webDirectory = path.resolve(import.meta.dirname, "../../..");
const apiDirectory = path.resolve(webDirectory, "../api");

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") resolve(address.port);
      else reject(new Error("no port"));
    });
  });
}

/**
 * count distinct free ports, held until release() so nothing else on the machine (another worktree's journeys) can
 * take one while the app builds. Release them just before the servers that use them start.
 */
async function reservePorts(count: number): Promise<{ ports: number[]; release: () => Promise<void> }> {
  const servers = Array.from({ length: count }, () => createServer());
  const release = () =>
    Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve)))).then(() => undefined);
  try {
    return { ports: await Promise.all(servers.map(listen)), release };
  } catch (error) {
    await release();
    throw error;
  }
}

/** A VAPID key pair for this run only, as web-push makes them (P-256, base64url), so no key sits in the repo. */
function vapidKeys(): { publicKey: string; privateKey: string } {
  const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const { x = "", y = "" } = pair.publicKey.export({ format: "jwk" });
  const { d = "" } = pair.privateKey.export({ format: "jwk" });
  const publicKey = Buffer.concat([Buffer.from([4]), Buffer.from(x, "base64url"), Buffer.from(y, "base64url")]);
  return { publicKey: publicKey.toString("base64url"), privateKey: d };
}

/** Runs a command to the end, failing with its output if it fails. */
function run(command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed with ${String(code)}:\n${output}`));
    });
  });
}

interface Started {
  stop(): void;
  /** Rejects, with the process's output, if it stops before stop() is called. */
  exited: Promise<never>;
}

/** Starts a long-running process. Its output is shown only if it stops before stop() is called. */
function start(command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }): Started {
  const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  let stopping = false;
  child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
  const exited = new Promise<never>((_resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      if (stopping) return;
      const message = `${command} stopped early with ${String(code)}:\n${output}`;
      console.error(message);
      reject(new Error(message));
    });
  });
  // Startup waits on it; after that an early stop is only logged.
  exited.catch(() => undefined);
  return {
    stop: () => {
      stopping = true;
      child.kill();
    },
    exited,
  };
}

/** Waits until url answers 200, for up to a minute, failing at once if the process serving it stops. */
async function waitUntilUp(url: string, server: Started): Promise<void> {
  const answering = async () => {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      try {
        if ((await fetch(url)).ok) return;
      } catch {
        // Not listening yet.
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`${url} didn't come up within a minute`);
  };
  await Promise.race([answering(), server.exited]);
}

export interface Servers {
  webUrl: string;
  stop(): void;
}

export async function startServers({ databaseUrl }: { databaseUrl: string }): Promise<Servers> {
  const reserved = await reservePorts(2);
  const [apiPort = 0, webPort = 0] = reserved.ports;
  const apiUrl = `http://127.0.0.1:${String(apiPort)}`;
  const webUrl = `http://127.0.0.1:${String(webPort)}`;
  const started: Started[] = [];
  const stop = () => {
    for (const server of started) server.stop();
  };
  try {
    // Build first, while nothing runs: a failed build has nothing to stop.
    await run(path.join(webDirectory, "node_modules/.bin/next"), ["build"], {
      cwd: webDirectory,
      env: { ...process.env, API_ORIGIN: apiUrl },
    });
    // The standalone server serves .next/static and public only when they sit beside it, as a Docker image puts them.
    const standalone = path.join(webDirectory, ".next/standalone/apps/web");
    await cp(path.join(webDirectory, ".next/static"), path.join(standalone, ".next/static"), { recursive: true });
    await cp(path.join(webDirectory, "public"), path.join(standalone, "public"), { recursive: true });

    const vapid = vapidKeys();
    await reserved.release();
    started.push(
      start(path.join(apiDirectory, "node_modules/.bin/tsx"), ["src/server.ts"], {
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
          VAPID_PUBLIC_KEY: vapid.publicKey,
          VAPID_PRIVATE_KEY: vapid.privateKey,
          VAPID_SUBJECT: "mailto:dev@travel-crm.localhost",
        },
      }),
      start(process.execPath, ["server.js"], {
        cwd: standalone,
        env: { ...process.env, NODE_ENV: "production", PORT: String(webPort), HOSTNAME: "127.0.0.1" },
      }),
    );
    const [api, web] = started;
    if (!api || !web) throw new Error("the servers didn't start");
    await waitUntilUp(`${apiUrl}/health`, api);
    await waitUntilUp(webUrl, web);
  } catch (error) {
    stop();
    await reserved.release();
    throw error;
  }
  // If the runner itself is stopped, its children go with it.
  process.once("exit", stop);
  return { webUrl, stop };
}
