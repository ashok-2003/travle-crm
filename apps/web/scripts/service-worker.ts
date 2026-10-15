// Bundles the service worker (src/service-worker/sw.ts) into one classic script, public/sw.js, which every browser
// that has service workers can run.
import path from "node:path";
import { build } from "esbuild";

export async function buildServiceWorker(appDirectory: string): Promise<string> {
  const outfile = path.join(appDirectory, "public/sw.js");
  await build({
    entryPoints: [path.join(appDirectory, "src/service-worker/sw.ts")],
    outfile,
    bundle: true,
    format: "iife",
    target: "es2022",
    minify: true,
    logLevel: "warning",
  });
  return outfile;
}
