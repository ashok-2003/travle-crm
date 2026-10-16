// `pnpm --filter @travel-crm/web lighthouse` (a CI gate, spec 12.1): Lighthouse on the built app's public pages, three
// runs each on Lighthouse's phone, each page's median held to the budgets in scripts/lighthouse-budgets.ts. Build the
// app first (`pnpm lighthouse` at the root does both). Chrome is CHROME_PATH, or Playwright's Chromium, which the
// journeys install. Lighthouse 12 dropped its PWA category: the journeys check the manifest and the service worker.
import { spawn } from "node:child_process";
import { access, cp } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { chromium } from "@playwright/test";
import { CATEGORIES, median, missedBudgets, summarise, type LighthouseRun } from "./lighthouse-budgets.js";

/** The pages anyone can open: the rest need a session, which Lighthouse doesn't have. */
const PAGES = ["/sign-in", "/offline"] as const;
const RUNS = 3;

const appDirectory = path.resolve(import.meta.dirname, "..");
const standalone = path.join(appDirectory, ".next/standalone/apps/web");

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer().listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address !== null && typeof address === "object") resolve(address.port);
        else reject(new Error("no port"));
      });
    });
  });
}

/** Waits up to half a minute for the server to answer. */
async function waitUntilUp(url: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (
      await fetch(url).then(
        (response) => response.ok,
        () => false,
      )
    )
      return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${url} didn't come up within half a minute`);
}

/** One Lighthouse run on a page, in a fresh headless Chrome, as Playwright starts it (no sandbox). */
function lighthouseRun(url: string, chromePath: string): Promise<LighthouseRun> {
  const args = [
    url,
    "--output=json",
    "--output-path=stdout",
    "--quiet",
    `--only-categories=${CATEGORIES.join(",")}`,
    "--chrome-flags=--headless=new --no-sandbox",
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(path.join(appDirectory, "node_modules/.bin/lighthouse"), args, {
      env: { ...process.env, CHROME_PATH: chromePath },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let report = "";
    let problems = "";
    child.stdout.on("data", (chunk: Buffer) => (report += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (problems += chunk.toString()));
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve(summarise(JSON.parse(report) as Parameters<typeof summarise>[0]));
      else reject(new Error(`Lighthouse failed on ${url} with ${String(code)}:\n${problems}`));
    });
  });
}

await access(path.join(standalone, "server.js")).catch(() => {
  throw new Error("No build to check: run `pnpm lighthouse` at the root, which builds the app first");
});
// The standalone server serves the build's files and public/ only from beside it, as the Docker image puts them.
await cp(path.join(appDirectory, ".next/static"), path.join(standalone, ".next/static"), { recursive: true });
await cp(path.join(appDirectory, "public"), path.join(standalone, "public"), { recursive: true });

const port = await freePort();
const server = spawn(process.execPath, ["server.js"], {
  cwd: standalone,
  env: { ...process.env, NODE_ENV: "production", PORT: String(port), HOSTNAME: "127.0.0.1" },
  stdio: ["ignore", "pipe", "pipe"],
});
// What the server printed, shown if it doesn't come up: a crash says why there.
let serverOutput = "";
server.stdout.on("data", (chunk: Buffer) => (serverOutput += chunk.toString()));
server.stderr.on("data", (chunk: Buffer) => (serverOutput += chunk.toString()));
try {
  const origin = `http://127.0.0.1:${String(port)}`;
  await waitUntilUp(`${origin}/sign-in`).catch((error: unknown) => {
    console.error(`The server's output:\n${serverOutput}`);
    throw error;
  });
  const chromePath = process.env.CHROME_PATH ?? chromium.executablePath();
  const missed: string[] = [];
  for (const page of PAGES) {
    const runs: LighthouseRun[] = [];
    for (let attempt = 0; attempt < RUNS; attempt += 1) runs.push(await lighthouseRun(`${origin}${page}`, chromePath));
    const scores = CATEGORIES.map((category) => `${category} ${String(median(runs.map((run) => run[category])))}`);
    const layoutShift = median(runs.map((run) => run.layoutShift));
    console.log(`${page}: ${scores.join(", ")}, layout shift ${String(layoutShift)} (medians of ${String(RUNS)} runs)`);
    missed.push(...missedBudgets(page, runs));
  }
  if (missed.length > 0) {
    console.error(missed.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Every page is within its budgets.");
  }
} finally {
  server.kill();
}
