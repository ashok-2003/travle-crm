// The product's name lives only in the brand package (spec 10): one edit renames the product. The check reads every
// file git tracks or would track; the spec and plans in docs/ name the product on purpose and are skipped.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { brand } from "../src/index.js";
import { findProductNameOutsideBrand } from "../src/name-check.js";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");

/** Every file git tracks, plus new files it would track, as repository-relative paths. */
function repositoryFiles(): { path: string; text: string }[] {
  const listing = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  return listing
    .split("\0")
    .filter((file) => file !== "" && existsSync(path.join(repositoryRoot, file)))
    .map((file) => ({ path: file, text: readFileSync(path.join(repositoryRoot, file), "utf8") }));
}

describe("product name check", () => {
  it("finds the product name nowhere outside packages/brand and docs", () => {
    const files = repositoryFiles();
    expect(files.length).toBeGreaterThan(100);
    expect(findProductNameOutsideBrand({ files, names: [brand.productName, brand.shortName] })).toEqual([]);
  });

  it("reports each line that names the product, in any case or spacing", () => {
    const files = [
      { path: "apps/api/src/app.ts", text: 'const title = "Acme Trips";\nconst ok = true;' },
      { path: "packages/ui/src/header.tsx", text: "<h1>ACME   trips</h1>" },
    ];
    expect(findProductNameOutsideBrand({ files, names: ["Acme Trips"] })).toEqual([
      { path: "apps/api/src/app.ts", line: 1, text: 'const title = "Acme Trips";' },
      { path: "packages/ui/src/header.tsx", line: 1, text: "<h1>ACME   trips</h1>" },
    ]);
  });

  it("reports a line once when it holds the name and the short name", () => {
    const files = [{ path: "README.md", text: "Acme Trips, or Trips for short" }];
    expect(findProductNameOutsideBrand({ files, names: ["Acme Trips", "Trips"] })).toEqual([
      { path: "README.md", line: 1, text: "Acme Trips, or Trips for short" },
    ]);
  });

  it("catches the name across a line break and in slug and identifier forms, at the line where it starts", () => {
    const names = ["Travel Agency OS", "Agency OS"];
    const cases = [
      { text: "intro\nTravel Agency\nOS", line: 2 },
      { text: "ok\nok\nhttps://travel-agency-os.example", line: 3 },
      { text: "class TravelAgencyOS {}", line: 1 },
      { text: "const id = 'travel_agency_os';", line: 1 },
      { text: "see the\nagency\n  os docs", line: 2 },
      { text: "host: agency.os", line: 1 },
    ];
    for (const { text, line } of cases) {
      const findings = findProductNameOutsideBrand({ files: [{ path: "a.txt", text }], names });
      expect(
        findings.map((finding) => finding.line),
        text,
      ).toEqual([line]);
      expect(findings[0]?.text, text).toBe(text.split("\n")[line - 1]);
    }
  });

  it("lets ordinary words through", () => {
    const text = "A travel agency uses an OS.\nThe agency\nsent it. Travel and OS are separate.";
    expect(
      findProductNameOutsideBrand({ files: [{ path: "a.txt", text }], names: ["Travel Agency OS", "Agency OS"] }),
    ).toEqual([]);
  });

  it("skips the brand package, docs and binary files", () => {
    const files = [
      { path: "packages/brand/src/brand.ts", text: 'productName: "Acme Trips"' },
      { path: "docs/superpowers/specs/design.md", text: "Acme Trips is a working name" },
      { path: "apps/web/public/logo.png", text: "\u0089PNG\r\n\u001a\n\u0000\u0000Acme Trips" },
    ];
    expect(findProductNameOutsideBrand({ files, names: ["Acme Trips"] })).toEqual([]);
  });
});
