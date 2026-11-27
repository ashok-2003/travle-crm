// @vitest-environment node
// The customer's pages at /p/<token> are written by the api but served on the web app's address, so the generate step
// copies the brand's fonts to public/fonts, where those pages' @font-face rules ask for them.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { copyCustomerFonts } from "../scripts/customer-fonts.js";

describe("the customer pages' fonts", () => {
  let target = "";
  afterAll(async () => {
    if (target !== "") await rm(target, { recursive: true, force: true });
  });

  it("copies each font file the api's pages name at /fonts, and only those", async () => {
    target = path.join(await mkdtemp(path.join(tmpdir(), "customer-fonts-")), "fonts");
    const copied = await copyCustomerFonts(target);
    const pages = await readFile(path.resolve(import.meta.dirname, "../../api/src/public-html.ts"), "utf8");
    const named = [...new Set(pages.match(/[a-z0-9-]+\.woff2/g) ?? [])].sort();
    expect(named.length).toBeGreaterThanOrEqual(6);
    expect(copied).toEqual(named);
    for (const file of copied) {
      const bytes = await readFile(path.join(target, file));
      expect(bytes.subarray(0, 4).toString("latin1"), file).toBe("wOF2");
    }
  });
});
