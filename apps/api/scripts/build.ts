// `pnpm --filter @travel-crm/api-server build`: the bundle the api's Docker image runs, written to dist/
// (scripts/bundle.ts). Run `pnpm --filter @travel-crm/db generate` first: the bundle carries Prisma's generated client.
import { rm } from "node:fs/promises";
import path from "node:path";
import { bundleApi } from "./bundle.js";

const apiDirectory = path.resolve(import.meta.dirname, "..");
const outdir = path.join(apiDirectory, "dist");

await rm(outdir, { recursive: true, force: true });
const metafile = await bundleApi({ apiDirectory, outdir });
console.log(`Wrote ${String(Object.keys(metafile.outputs).length)} files to dist/`);
