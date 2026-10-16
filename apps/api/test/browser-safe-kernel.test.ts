// The domain kernel (money, GST, dates, ids) is imported by the web app's client code (plan 5A's lib/format.ts), so it
// must bundle for a browser: no Node built-ins, no pg-boss, nothing from @travel-crm/integrations. This bundles it
// with esbuild for the browser and expects no errors. It lives here because esbuild is this package's own dependency:
// it bundles the api for its Docker image (scripts/bundle.ts).
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

describe("the domain kernel in a browser", () => {
  it("bundles for platform browser, with no Node built-in or server-only package", async () => {
    const result = await build({
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
    expect(result.outputFiles[0]?.text).toContain("formatMoney");
  });
});
