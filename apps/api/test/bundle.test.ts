// The bundle the api's Docker image runs (scripts/bundle.ts, ADR 0027): one entry per command and the .xlsx reader's
// thread (ADR 0030), our code and every third-party package in it but the integrations package's own, which the image
// installs from the lockfile, and none of the tests' code. It is built as the image lays it out (/app/apps/api: dist/
// beside the integrations package's node_modules), so the thread runs as it will there.
import { execFile } from "node:child_process";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { builtinModules } from "node:module";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createSpreadsheets } from "@travel-crm/integrations/spreadsheets";
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
  let root = "";
  let outdir = "";
  let metafile: Metafile;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "api-bundle-"));
    outdir = path.join(root, "dist");
    await symlink(
      path.resolve(apiDirectory, "../../packages/integrations/node_modules"),
      path.join(root, "node_modules"),
    );
    metafile = await bundleApi({ apiDirectory, outdir });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
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
      "xlsx-thread.mjs": "../../packages/integrations/src/spreadsheets/xlsx-thread.ts",
      "axiom-transport.mjs": "../../packages/integrations/src/logging/axiom-transport.ts",
    });
  });

  it("ships log lines to Axiom from the bundle's axiom-transport.mjs and the installed pino", async () => {
    const posts: { authorization: string | undefined; path: string; body: string }[] = [];
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        posts.push({
          authorization: request.headers.authorization,
          path: request.url ?? "",
          body: Buffer.concat(chunks).toString(),
        });
        response.end("{}");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      // A process of its own: closing the transport waits for its thread, which posts to the server on this thread.
      const script = path.join(root, "ship.mjs");
      await writeFile(
        script,
        `import { transport, pino } from "pino";
const shipping = transport({
  target: ${JSON.stringify(path.join(outdir, "axiom-transport.mjs"))},
  options: { token: "bundle-token", dataset: "bundle", url: "http://127.0.0.1:${String((server.address() as AddressInfo).port)}" },
});
pino(shipping).info("from the bundle");
shipping.end();
shipping.on("close", () => process.exit(0));
`,
      );
      await promisify(execFile)(process.execPath, [script], { cwd: root, timeout: 30_000 });
    } finally {
      server.close();
    }
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ authorization: "Bearer bundle-token", path: "/v1/datasets/bundle/ingest" });
    expect(posts[0]?.body).toContain("from the bundle");
  });

  it("reads an .xlsx in its own thread, from the bundle's xlsx-thread.mjs and the installed packages", async () => {
    const spreadsheets = createSpreadsheets({
      xlsxThread: { file: pathToFileURL(path.join(outdir, "xlsx-thread.mjs")) },
    });
    const writer = spreadsheets.writer({
      kind: "xlsx",
      sheetName: "Leads",
      columns: [{ header: "Name", kind: "text" }],
    });
    writer.write([["Asha Sharma"]]);
    const limits = { kind: "xlsx", maxRows: 10, maxColumns: 5, maxCellLength: 100 } as const;
    const sheet = await spreadsheets.read(await writer.finish(), limits);
    expect(sheet.rows).toEqual([{ rowNumber: 2, cells: ["Asha Sharma"] }]);
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
