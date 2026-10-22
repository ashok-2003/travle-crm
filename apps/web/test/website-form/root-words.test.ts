// The root layout carries only the `common` words (each screen group brings its own provider, the visitor's form a small
// one), so nothing at the root may read another namespace in the browser: a missing message shows only there.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const app = path.resolve(import.meta.dirname, "../../src/app");
const src = path.resolve(app, "..");
/** Routes that bring a provider of their own. */
const withOwnWords = ["(app)", "(account)", "console", "f", "embed"];

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const full = path.join(directory, name);
    if (directory === app && withOwnWords.includes(name)) return [];
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

describe("the words at the root", () => {
  it("are read by no client hook in the routes outside the screen groups (offline, 404, home)", () => {
    for (const file of filesUnder(app).filter((name) => /\.tsx?$/.test(name))) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/\b(useTranslations|useFormatter|useLocale)\b/);
    }
  });

  it("are only `common` for the pieces the root layout renders around every page", () => {
    for (const file of ["data/providers.tsx", "pwa/app-providers.tsx", "pwa/service-worker-registration.tsx"]) {
      const used = [...readFileSync(path.join(src, file), "utf8").matchAll(/useTranslations\(\s*"([^"]+)"/g)];
      expect(
        used.map((match) => match[1]?.split(".")[0]),
        file,
      ).toEqual(used.map(() => "common"));
    }
    expect(readFileSync(path.join(app, "layout.tsx"), "utf8")).toContain("messages={{ common: messages.common }}");
  });
});
