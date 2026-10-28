// Starts the real api, the worker, the console and the built web app for the journeys, the way a deployment runs
// them: the api's three commands from its source with tsx (the api and the console on free ports; the worker has
// none), the web app as Next.js's standalone server. The web app is built here, because its rewrites are fixed at
// build time and must point at this api and this console. If anything fails on the way, whatever already started is
// stopped again, so a failed run leaves no process behind.
import { spawn } from "node:child_process";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { cp } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import path from "node:path";
import { META_E2E } from "./fake-meta";
import { OPENROUTER_E2E_KEY } from "./fake-openrouter";
import { MSG91_E2E } from "./fake-msg91";
import type { EmailVariables } from "./mailpit";
import type { StorageVariables } from "./minio";

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

/** What the sheets sync reads (spec 14), for this run only: a throwaway account whose key nothing ever signs with. */
function sheetsVariables(googleUrl: string, accountEmail: string): Record<string, string> {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const account = { client_email: accountEmail, private_key: privateKey.export({ type: "pkcs8", format: "pem" }) };
  return {
    GOOGLE_SHEETS_SERVICE_ACCOUNTS: Buffer.from(JSON.stringify([account])).toString("base64"),
    SHEETS_HASH_KEY: randomBytes(32).toString("hex"),
    // The real adapter runs against the journeys' fake Google, with a fixed token (apps/api/src/services.ts).
    GOOGLE_SHEETS_TEST_SERVER_URL: googleUrl,
    SHEETS_CHECK_INTERVAL_SECONDS: "1",
  };
}

/** The Meta lead ads' five settings (ADR 0034) with test values, and the fake Graph the real adapter reads instead of Meta's. */
function metaVariables(graphUrl: string): Record<string, string> {
  return {
    META_APP_ID: META_E2E.appId,
    META_APP_SECRET: META_E2E.appSecret,
    META_WEBHOOK_VERIFY_TOKEN: META_E2E.verifyToken,
    META_LOGIN_CONFIG_ID: META_E2E.loginConfigId,
    META_TOKEN_KEY: META_E2E.tokenKey,
    META_GRAPH_TEST_SERVER_URL: graphUrl,
  };
}

/** WhatsApp's three settings (ADR 0035) with test values, and the fake MSG91 the real adapter reads instead of MSG91's. */
function whatsappVariables(msg91Url: string): Record<string, string> {
  return {
    MSG91_AUTHKEY: MSG91_E2E.authKey,
    MSG91_WEBHOOK_TOKEN: MSG91_E2E.webhookToken,
    MSG91_WEBHOOK_KEY: MSG91_E2E.webhookKey,
    MSG91_TEST_SERVER_URL: msg91Url,
  };
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
  /** What the process has printed so far. */
  output(): string;
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
    output: () => output,
  };
}

/** Waits until ready() holds, checking every half second for up to a minute, failing at once if the process stops. */
async function waitUntil(what: string, ready: () => Promise<boolean>, server: Started): Promise<void> {
  const waiting = async () => {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (await ready()) return;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`${what} didn't come up within a minute`);
  };
  await Promise.race([waiting(), server.exited]);
}

/** Waits until url answers 200. */
function waitUntilUp(url: string, server: Started): Promise<void> {
  return waitUntil(
    url,
    () =>
      fetch(url).then(
        (response) => response.ok,
        () => false,
      ),
    server,
  );
}

export interface Servers {
  /** The api itself, for the journeys that send it a request straight, with headers a proxy would add. */
  apiUrl: string;
  webUrl: string;
  consoleUrl: string;
  stop(): void;
}

export async function startServers({
  databaseUrl,
  platformDatabaseUrl,
  storage,
  email,
  google,
  meta,
  msg91,
  ai,
  turnstile,
}: {
  databaseUrl: string;
  /** The platform role's connection, which only the console is given (ADR 0019). */
  platformDatabaseUrl: string;
  /** A real bucket (support/minio.ts): the api checks it at start-up. */
  storage: StorageVariables;
  /** Mailpit's SMTP (support/mailpit.ts), where journeys read the emails the api sends. */
  email: EmailVariables;
  /** The fake Google (support/fake-google.ts): its address, and the address spreadsheets are shared with. */
  google: { url: string; accountEmail: string };
  /** The fake Meta (support/fake-meta.ts): the Graph address the real adapter is given. */
  meta: { url: string };
  /** The fake MSG91 (support/fake-msg91.ts): the address the real adapter is given. */
  msg91: { url: string };
  /** The fake OpenRouter (support/fake-openrouter.ts): where the AI adapter's calls are sent; only the api reads it. */
  ai: { url: string };
  /** The fake Turnstile's siteverify address (support/fake-turnstile.ts). */
  turnstile: { verifyUrl: string };
}): Promise<Servers> {
  const reserved = await reservePorts(3);
  const [apiPort = 0, consolePort = 0, webPort = 0] = reserved.ports;
  const apiUrl = `http://127.0.0.1:${String(apiPort)}`;
  const consoleUrl = `http://127.0.0.1:${String(consolePort)}`;
  const webUrl = `http://127.0.0.1:${String(webPort)}`;
  const started: Started[] = [];
  const stop = () => {
    // E2E_SERVER_LOGS=1 shows what the servers printed, for finding why a journey's worker step did not happen.
    if (process.env.E2E_SERVER_LOGS) for (const server of started) console.error(server.output());
    for (const server of started) server.stop();
  };
  try {
    // Build first, while nothing runs: a failed build has nothing to stop.
    await run(path.join(webDirectory, "node_modules/.bin/next"), ["build"], {
      cwd: webDirectory,
      env: {
        ...process.env,
        API_ORIGIN: apiUrl,
        CONSOLE_ORIGIN: consoleUrl,
        // The browser uploads to MinIO and loads images from it: the policy must allow its origin.
        STORAGE_ORIGIN: new URL(storage.S3_ENDPOINT).origin,
      },
    });
    // The standalone server serves .next/static and public only when they sit beside it, as a Docker image puts them.
    const standalone = path.join(webDirectory, ".next/standalone/apps/web");
    await cp(path.join(webDirectory, ".next/static"), path.join(standalone, ".next/static"), { recursive: true });
    await cp(path.join(webDirectory, "public"), path.join(standalone, "public"), { recursive: true });

    const vapid = vapidKeys();
    const sheets = sheetsVariables(google.url, google.accountEmail);
    /** What the api's three commands all read (apps/api/src/environment.ts). */
    const apiEnvironment: NodeJS.ProcessEnv = {
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
      // Plan 3's services are configured from the environment, all of them real: the api refuses to start without
      // a bucket it can use, and journeys read the email it sends.
      ...storage,
      ...email,
      EMAIL_FROM_ADDRESS: "no-reply@travel-crm.localhost",
      VAPID_PUBLIC_KEY: vapid.publicKey,
      VAPID_PRIVATE_KEY: vapid.privateKey,
      VAPID_SUBJECT: "mailto:dev@travel-crm.localhost",
      ...sheets,
      ...metaVariables(meta.url),
      ...whatsappVariables(msg91.url),
    };
    const tsx = path.join(apiDirectory, "node_modules/.bin/tsx");
    await reserved.release();
    // The website form's settings are the api's alone (spec 16). One proxy hop: the journeys that need a visitor's address
    // send the api a request straight with a crafted X-Forwarded-For, and the web app's rewrite, which adds one entry, gives
    // a browser "no address" (plan F7). The keys are Cloudflare's published always-passes pair; the real adapter asks the
    // fake siteverify, which judges a token by its own words.
    const formEnvironment: NodeJS.ProcessEnv = {
      ...apiEnvironment,
      PUBLIC_FORM_PROXY_HOPS: "1",
      TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
      TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
      TURNSTILE_VERIFY_URL: turnstile.verifyUrl,
      // Suggest reply (ADR 0029): the api alone asks the AI, and its calls go to the fake.
      OPENROUTER_API_KEY: OPENROUTER_E2E_KEY,
      AI_TEST_SERVER_URL: ai.url,
    };
    const api = start(tsx, ["src/server.ts"], { cwd: apiDirectory, env: formEnvironment });
    const worker = start(tsx, ["src/worker.ts"], { cwd: apiDirectory, env: apiEnvironment });
    const platformConsole = start(tsx, ["src/console.ts"], {
      cwd: apiDirectory,
      // As apps/api/src/console-environment.ts reads them.
      env: {
        ...apiEnvironment,
        DATABASE_PLATFORM_URL: platformDatabaseUrl,
        CONSOLE_PORT: String(consolePort),
        // The console holds the hash key (erasure) and no account: it never reads a sheet.
        GOOGLE_SHEETS_SERVICE_ACCOUNTS: "",
        GOOGLE_SHEETS_TEST_SERVER_URL: "",
        SHEETS_CHECK_INTERVAL_SECONDS: "",
        // Nor does it read Meta: the api and the worker hold the app secret and the token key.
        ...Object.fromEntries(Object.keys(metaVariables("")).map((name) => [name, ""])),
      },
    });
    const web = start(process.execPath, ["server.js"], {
      cwd: standalone,
      env: { ...process.env, NODE_ENV: "production", PORT: String(webPort), HOSTNAME: "127.0.0.1" },
    });
    started.push(api, worker, platformConsole, web);
    await waitUntilUp(`${apiUrl}/health`, api);
    await waitUntilUp(`${consoleUrl}/health`, platformConsole);
    // The worker has no port; it says when its jobs and listeners are running.
    await waitUntil("the worker", () => Promise.resolve(worker.output().includes("worker running")), worker);
    await waitUntilUp(webUrl, web);
  } catch (error) {
    stop();
    await reserved.release();
    throw error;
  }
  // If the runner itself is stopped, its children go with it.
  process.once("exit", stop);
  return { apiUrl, webUrl, consoleUrl, stop };
}
