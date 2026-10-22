// The visitor's form is light (spec 12): read from a finished `next build`, what /f/[key] loads on first visit. The plan's
// number is 150 KB gzipped; every page of this app already carries about 240 KB of framework (react-dom, the router, the
// messages provider), so the budget is read as what the form adds to the plainest page (/offline). The widget for Turnstile
// is not in it (it loads only for a server with keys), and no font beyond the app's own is fetched. F9's full gate builds the
// app first; without a build this suite is skipped, saying so in its name.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const statsFile = path.join(root, ".next/diagnostics/route-bundle-stats.json");
const built = existsSync(statsFile);

const FORM_BUDGET_KB = 150;
const KB = 1024;

interface RouteStats {
  route: string;
  firstLoadChunkPaths: string[];
}

const gzippedJs = (chunk: string) => gzipSync(readFileSync(path.join(root, chunk))).length;
const weightOf = (route: RouteStats) => route.firstLoadChunkPaths.reduce((sum, chunk) => sum + gzippedJs(chunk), 0);

function cssFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) return cssFiles(full);
    return name.endsWith(".css") ? [full] : [];
  });
}

describe.skipIf(!built)(
  `the built form page${built ? "" : " (skipped: run `pnpm --filter @travel-crm/web build` first)"}`,
  () => {
    const routes = built ? (JSON.parse(readFileSync(statsFile, "utf8")) as RouteStats[]) : [];
    const route = (name: string): RouteStats => {
      const found = routes.find((candidate) => candidate.route === name);
      if (found === undefined) throw new Error(`${name} is not in the build's route stats`);
      return found;
    };

    it(`adds at most ${String(FORM_BUDGET_KB)} KB gzipped to the plainest page's first load`, () => {
      const added = (weightOf(route("/f/[key]")) - weightOf(route("/offline"))) / KB;
      expect(added).toBeLessThanOrEqual(FORM_BUDGET_KB);
    });

    it("loads the embed with exactly the form's code", () => {
      expect(route("/embed/[key]").firstLoadChunkPaths).toEqual(route("/f/[key]").firstLoadChunkPaths);
    });

    it("leaves the Turnstile widget out of the first load", () => {
      const widget = readdirSync(path.join(root, ".next/static/chunks"))
        .filter((name) => name.endsWith(".js"))
        .filter((name) =>
          readFileSync(path.join(root, ".next/static/chunks", name), "utf8").includes("turnstile/v0/api.js"),
        )
        .map((name) => `.next/static/chunks/${name}`);
      expect(widget.length).toBeGreaterThan(0);
      const firstLoad = new Set(route("/f/[key]").firstLoadChunkPaths);
      expect(widget.filter((chunk) => firstLoad.has(chunk))).toEqual([]);
    });

    it("fetches no web font from another origin", () => {
      for (const file of cssFiles(path.join(root, ".next/static"))) {
        expect(readFileSync(file, "utf8"), file).not.toMatch(/url\(\s*["']?(https?:)?\/\//);
      }
    });
  },
);
