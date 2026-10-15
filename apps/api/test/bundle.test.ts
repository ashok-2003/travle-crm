// The bundle the api's Docker image runs (scripts/bundle.ts, ADR 0027): one entry per command, our code and every
// third-party package in it but the integrations package's own, which the image installs from the lockfile, and none
// of the tests' code.
import { mkdtemp, rm } from "node:fs/promises";
import { builtinModules } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Metafile } from "esbuild";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bundleApi, runtimePackages } from "../scripts/bundle.js";

const apiDirectory = path.resolve(import.meta.dirname, "..");

/** "@react-pdf/renderer/lib/x" is "@react-pdf/renderer"; "util/types" is "util". */
function packageOf(specifier: string): string {
  const parts = specifier.replace(/^node:/, "").split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? "");
}

/** The package an input file of the bundle comes from, when it comes from node_modules. */
function installedPackageOf(input: string): string | null {
  const after = input.split("node_modules/").at(-1);
  return input.includes("node_modules/") && after !== undefined ? packageOf(after) : null;
}

describe("the api's bundle", () => {
  let outdir = "";
  let metafile: Metafile;

  beforeAll(async () => {
    outdir = await mkdtemp(path.join(tmpdir(), "api-bundle-"));
    metafile = await bundleApi({ apiDirectory, outdir });
  });

  afterAll(async () => {
    await rm(outdir, { recursive: true, force: true });
  });

  it("has a file for each of the image's commands", () => {
    const entries = Object.fromEntries(
      Object.entries(metafile.outputs).map(([file, output]) => [path.basename(file), output.entryPoint]),
    );
    expect(entries).toMatchObject({
      "server.mjs": "src/server.ts",
      "worker.mjs": "src/worker.ts",
      "console.mjs": "src/console.ts",
      "console-command.mjs": "src/console-command.ts",
    });
  });

  it("leaves out only Node's own modules, the integrations package's vendor packages and pg's native driver", async () => {
    const leftOut = new Set([...(await runtimePackages(apiDirectory)), "pg-native"]);
    const imported = Object.values(metafile.outputs).flatMap((output) =>
      output.imports.filter((entry) => entry.external).map((entry) => entry.path),
    );
    const unexpected = imported.filter(
      (specifier) => !builtinModules.includes(specifier.replace(/^node:/, "")) && !leftOut.has(packageOf(specifier)),
    );
    expect(unexpected).toEqual([]);
    expect(imported).toEqual(expect.arrayContaining(["@react-pdf/renderer", "pg-boss", "react"]));
  });

  it("carries every other package itself, so the image needs no other node_modules", async () => {
    const leftOut = await runtimePackages(apiDirectory);
    const carried = new Set(Object.keys(metafile.inputs).flatMap((input) => installedPackageOf(input) ?? []));
    expect([...carried]).toEqual(expect.arrayContaining(["better-auth", "hono", "@prisma/client", "pg", "zod"]));
    expect(leftOut.filter((name) => carried.has(name))).toEqual([]);
  });

  it("holds none of the tests' code", () => {
    const fromTests = Object.keys(metafile.inputs).filter(
      (input) => installedPackageOf(input) === null && /(^|\/)test\//.test(input),
    );
    expect(fromTests).toEqual([]);
  });
});
