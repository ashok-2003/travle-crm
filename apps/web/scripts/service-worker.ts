// Bundles the service worker (src/service-worker/sw.ts) into one classic script, public/sw.js, which every browser
// that has service workers can run. The bundle carries the app's pages, listed from the page files under src/app, so
// the worker keeps every screen's shell for offline use without anyone keeping a list.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

/** Next.js's page files (its default page extensions). */
const PAGE_FILE = /^page\.(tsx|ts|jsx|js)$/;

/**
 * The address of each page file, given relative to src/app: "(app)/roles/[key]/page.tsx" is "/roles/[key]". A route
 * group "(app)" and a parallel route's slot "@modal" add nothing to the address; a private folder "_parts" holds no
 * pages.
 */
export function pageRoutes(files: readonly string[]): string[] {
  const routes = new Set<string>();
  for (const file of files) {
    const segments = file.split(/[\\/]/);
    if (!PAGE_FILE.test(segments.at(-1) ?? "")) continue;
    const folders = segments.slice(0, -1);
    if (folders.some((folder) => folder.startsWith("_"))) continue;
    routes.add(`/${folders.filter((folder) => !folder.startsWith("(") && !folder.startsWith("@")).join("/")}`);
  }
  return [...routes].sort();
}

/**
 * What names this build, so every deploy changes sw.js and the worker refreshes its shells once per build. The script
 * runs before `next build`, so Next's own build id isn't there yet: the commit instead (CACHE_VERSION, which the Docker
 * build passes; Vercel's and GitHub's commit variables; git), else a hash of the page list and the time, which is new
 * for every build.
 */
export function currentBuildId(routes: readonly string[]): string {
  const named = [process.env.CACHE_VERSION, process.env.VERCEL_GIT_COMMIT_SHA, process.env.GITHUB_SHA].find(
    (id) => id !== undefined && id.trim() !== "",
  );
  // git runs only when no variable names the build.
  const commit = named ?? gitCommit();
  if (commit !== undefined && commit.trim() !== "") return commit.trim();
  return createHash("sha256")
    .update(routes.join(",") + "@" + String(Date.now()))
    .digest("hex")
    .slice(0, 16);
}

function gitCommit(): string | undefined {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return undefined;
  }
}

/** The worker's code, bundled with the app's pages as APP_ROUTES and the build's name as BUILD_ID. */
export async function bundleServiceWorker(appDirectory: string, buildId?: string): Promise<string> {
  const pageFiles = await readdir(path.join(appDirectory, "src/app"), { recursive: true });
  const routes = pageRoutes(pageFiles);
  const result = await build({
    entryPoints: [path.join(appDirectory, "src/service-worker/sw.ts")],
    write: false,
    bundle: true,
    format: "iife",
    target: "es2022",
    minify: true,
    logLevel: "warning",
    define: { APP_ROUTES: JSON.stringify(routes), BUILD_ID: JSON.stringify(buildId ?? currentBuildId(routes)) },
  });
  const [bundle] = result.outputFiles;
  if (!bundle) throw new Error("esbuild wrote no service worker");
  return bundle.text;
}

export async function buildServiceWorker(appDirectory: string): Promise<string> {
  const outfile = path.join(appDirectory, "public/sw.js");
  await writeFile(outfile, await bundleServiceWorker(appDirectory));
  return outfile;
}
