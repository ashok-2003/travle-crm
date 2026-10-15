// The app as Next.js serves it, for the service worker's tests (worker-sandbox.ts runs the worker): static pages
// naming one build's script and stylesheet (which names fonts, two shared by every build), a role's page rendered per
// request, the api behind /api in any case (the rewrite ignores
// case). Also the worker as it ships, bundled once, and ways to install it and load a page through it.
import { bundleServiceWorker } from "../../scripts/service-worker";
import { CACHE_NAMES } from "@/service-worker/strategy";
import { answer, ORIGIN, startWorker, type SiteAnswer, type Worker } from "./worker-sandbox";

export const { pages: PAGES, static: STATIC } = CACHE_NAMES;

export const at = (path: string) => new URL(path, ORIGIN).href;

let bundle: Promise<string> | undefined;

/** The worker's code, with the app's real page list. */
export function bundledWorker(): Promise<string> {
  bundle ??= bundleServiceWorker(new URL("../..", import.meta.url).pathname);
  return bundle;
}

export function app(build = "a"): SiteAnswer {
  return (url) => {
    const path = url.pathname;
    if (path.toLowerCase().startsWith("/api/")) {
      return answer('{"result":{"data":{"organization":"Sharma Travels"}}}', {
        headers: { "content-type": "application/json" },
      });
    }
    if (path.endsWith(".css")) {
      const fonts = ["devanagari", "tamil", `only-${build}`];
      return answer(fonts.map((font) => `@font-face{src:url("../media/${font}.woff2")}`).join(""));
    }
    if (path.startsWith("/_next/static/") || path.startsWith("/icons/")) return answer(`file ${path}`);
    const files = `<link rel="stylesheet" href="/_next/static/chunks/${build}.css"/><script src="/_next/static/chunks/${build}.js" async=""></script>`;
    const page = `<html><body>${path} of build ${build}${files}</body></html>`;
    if (path.startsWith("/roles/")) {
      return answer(page, {
        headers: { "content-type": "text/html", "cache-control": "private, no-cache, no-store, max-age=0" },
      });
    }
    if (path === "/nowhere") return answer("not found", { status: 404, headers: { "content-type": "text/html" } });
    return answer(page, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "s-maxage=31536000" },
    });
  };
}

/** The worker, installed and active, in front of the site. */
export async function installed(site = app()): Promise<Worker> {
  const worker = startWorker(await bundledWorker(), site);
  await worker.install();
  await worker.activate();
  return worker;
}

/** The answer a page load gets, once everything it started is done. */
export async function pageLoad(worker: Worker, path: string): Promise<Response | undefined> {
  const event = worker.fetch(path, { mode: "navigate" });
  const response = await event.answer;
  await event.settled();
  return response;
}
