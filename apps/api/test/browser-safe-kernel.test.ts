// The domain kernel (money, GST, dates, ids) is imported by the web app's client code (plan 5A's lib/format.ts), so it
// must bundle for a browser: no Node built-ins, no pg-boss, nothing from @travel-crm/integrations. This bundles it
// with esbuild for the browser and expects no errors. It lives here because esbuild is reachable through tsx, this
// package's own dependency, without adding one.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** The part of esbuild's API this uses (esbuild itself isn't this package's dependency, so neither are its types). */
interface Esbuild {
  build(options: Record<string, unknown>): Promise<{ errors: unknown[]; outputFiles?: { text: string }[] }>;
}

const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve("tsx"))("esbuild") as Esbuild;

describe("the domain kernel in a browser", () => {
  it("bundles for platform browser, with no Node built-in or server-only package", async () => {
    const result = await esbuild.build({
      stdin: {
        contents: 'export * from "@travel-crm/domain/kernel";',
        resolveDir: fileURLToPath(new URL(".", import.meta.url)),
        loader: "ts",
      },
      bundle: true,
      platform: "browser",
      format: "esm",
      write: false,
      logLevel: "silent",
    });
    expect(result.errors).toEqual([]);
    expect(result.outputFiles?.[0]?.text).toContain("formatMoney");
  });
});
