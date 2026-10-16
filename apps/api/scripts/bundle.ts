// Bundles the api's commands for its Docker image (ADR 0027): the api, the worker, the console and the console's
// one-off commands, as plain JavaScript that Node runs without a TypeScript loader. Our packages and every third-party
// package are in the bundle but the integrations package's own, which the image installs from the lockfile.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { build, type Metafile } from "esbuild";

/** One entry per command: each file in src/ that a container starts. */
const ENTRY_POINTS = ["server", "worker", "console", "console-command"] as const;

/**
 * The integrations package's vendor packages, left out of the bundle and installed as they are (`pnpm deploy` of that
 * package, in the Dockerfile). React-PDF and the fonts read files of their own at run time: pdfkit its standard fonts
 * and colour profile, the PDF fonts their woff files (packages/integrations/src/pdf/fonts.ts). React must be the copy
 * React-PDF renders with. The other adapters' packages follow, so no package is in the image twice.
 */
export async function runtimePackages(apiDirectory: string): Promise<string[]> {
  const manifest = await readFile(path.join(apiDirectory, "../../packages/integrations/package.json"), "utf8");
  const { dependencies = {} } = JSON.parse(manifest) as { dependencies?: Record<string, string> };
  return Object.keys(dependencies).filter((name) => !name.startsWith("@travel-crm/"));
}

/** Writes the bundle to outdir: <command>.mjs for each command, and the chunks they share. */
export async function bundleApi({ apiDirectory, outdir }: { apiDirectory: string; outdir: string }): Promise<Metafile> {
  const leftOut = await runtimePackages(apiDirectory);
  const result = await build({
    absWorkingDir: apiDirectory,
    entryPoints: ENTRY_POINTS.map((name) => `src/${name}.ts`),
    outdir,
    outExtension: { ".js": ".mjs" },
    bundle: true,
    platform: "node",
    target: "node24",
    format: "esm",
    // The code the four commands share goes in chunks once, rather than in each of them.
    splitting: true,
    // pg-native is pg's optional native driver: never installed, and only loaded when asked for.
    external: [...leftOut.flatMap((name) => [name, `${name}/*`]), "pg-native"],
    // Bundled CommonJS packages (pg among them) call require(), which an ES module doesn't have.
    banner: {
      js: 'import { createRequire as createRequireForBundle } from "node:module"; const require = createRequireForBundle(import.meta.url);',
    },
    // Names that clash between modules are renamed in a bundle; their functions and classes keep their own names.
    keepNames: true,
    metafile: true,
    logLevel: "warning",
  });
  return result.metafile;
}
