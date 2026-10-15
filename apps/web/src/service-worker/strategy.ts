// How the service worker answers each request, decided from the request alone so it can be tested without a worker.
// It keeps pages and the build's files for an offline shell (spec 11, DESIGN.md: an offline shell). It never stores
// an api answer: the organization's data is kept only by the query cache, which signing out wipes. Pages are safe to
// keep because they hold no data of anyone's: every screen loads its data in the browser, through the api.

/** network-only: the worker stays out of it. cache-first: files whose name changes with their content. page: a page
 * load, from the network when possible, else the copy kept from the last visit, else the offline page. */
export type Strategy = "network-only" | "cache-first" | "page";

export interface RequestFacts {
  url: string;
  method: string;
  /** "navigate" for a page load. */
  mode: string;
}

/** Bump a version when a cache's content changes shape: activation then drops the old one. */
export const CACHE_NAMES = { pages: "pages-v1", static: "static-v1" } as const;

/** Shown for a page that was never visited when there is no connection. Kept when the worker installs. */
export const OFFLINE_PAGE = "/offline";

export function strategyFor(request: RequestFacts, appOrigin: string): Strategy {
  if (request.method !== "GET") return "network-only";
  const url = new URL(request.url);
  if (url.origin !== appOrigin) return "network-only";
  // Before the page check: a password-reset email opens /api/auth/reset-password/<token> as a page load.
  if (url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return "network-only";
  if (request.mode === "navigate") return "page";
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) return "cache-first";
  // Everything else, such as the data Next.js's router fetches between pages (?_rsc=): a failed one makes the router
  // load the page itself, which the "page" strategy then answers.
  return "network-only";
}

/** The caches an older version of the worker made. */
export function cachesToDelete(cacheNames: readonly string[]): string[] {
  const current: readonly string[] = Object.values(CACHE_NAMES);
  return cacheNames.filter((name) => !current.includes(name));
}
