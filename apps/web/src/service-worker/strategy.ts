// How the service worker answers each request, decided from the request alone so it can be tested without a worker.
// It keeps the app's static pages and the build's files for an offline shell (spec 11, DESIGN.md: an offline shell),
// as shells.ts sets out. It never answers for the api, nor for the share links and webhooks the api serves on the
// app's address: the organization's data is kept only by the query cache, which signing out wipes, and a share link
// redirects to storage.

/** network-only: the worker stays out of it. cache-first: the build's files, whose names change with their content.
 * network-first: the icons, whose names don't. page: a page load, from the network, else the page's saved shell. */
export type Strategy = "network-only" | "cache-first" | "network-first" | "page";

export interface RequestFacts {
  url: string;
  method: string;
  /** "navigate" for a page load. */
  mode: string;
}

/** Every cache the worker makes starts with one of these; it deletes no others. */
export const CACHE_PREFIXES = { pages: "pages-", static: "static-" } as const;

/** Bump a version when a cache's content changes shape: activation then drops the old one. v2: pages keyed by path. */
export const CACHE_NAMES = { pages: `${CACHE_PREFIXES.pages}v2`, static: `${CACHE_PREFIXES.static}v2` } as const;

/** Shown for an address with no saved shell when there is no connection. */
export const OFFLINE_PAGE = "/offline";

/** How long a page load waits for a weak connection before the saved shell is shown instead. */
export const NAVIGATION_TIMEOUT_MS = 4000;

export function strategyFor(request: RequestFacts, appOrigin: string): Strategy {
  if (request.method !== "GET") return "network-only";
  const url = new URL(request.url);
  if (url.origin !== appOrigin) return "network-only";
  // Before the page check: a password-reset email opens /api/auth/reset-password/<token> as a page load, and a
  // customer opens a share link (/p/<token>) as one.
  if (isServerPath(url.pathname) || url.pathname === "/sw.js") return "network-only";
  if (request.mode === "navigate") return "page";
  if (url.pathname.startsWith("/_next/static/")) return "cache-first";
  if (url.pathname.startsWith("/icons/")) return "network-first";
  // Everything else, such as the data Next.js's router fetches between pages (?_rsc=): a failed one makes the router
  // load the page itself, which the "page" strategy then answers.
  return "network-only";
}

/** The paths rewritten to the api (next.config.ts). */
const SERVER_PATHS = ["/api", "/p", "/webhooks"];

/** /api, /p and /webhooks and everything under them, in any case: Next.js's rewrites ignore case
 * (caseSensitiveRoutes is off by default), so /API/trpc/... reaches the api too. */
function isServerPath(pathname: string): boolean {
  const path = pathname.toLowerCase();
  return SERVER_PATHS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** The caches an older version of the worker made. Only its own: other features may keep caches of theirs. */
export function cachesToDelete(cacheNames: readonly string[]): string[] {
  const current: readonly string[] = Object.values(CACHE_NAMES);
  const ours = Object.values(CACHE_PREFIXES);
  return cacheNames.filter((name) => ours.some((prefix) => name.startsWith(prefix)) && !current.includes(name));
}
