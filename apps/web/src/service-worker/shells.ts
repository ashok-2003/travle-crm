// What the service worker may keep for offline use, decided from facts alone so it can be tested without a worker:
// the shell of every static page (its HTML, which holds no one's data, as every screen loads its data in the browser),
// keyed by path alone, and the build's files those shells name. Never an api answer, a page rendered for one request,
// or an address's query, which can carry a reset token.
import { routes } from "../lib/routes";
import { OFFLINE_PAGE } from "./strategy";

/** Pages never kept: each handles a secret (a reset token in its address, a two-factor code or secret) and works
 * only online anyway. Offline they show the offline page. */
const NEVER_KEPT: readonly string[] = [routes.resetPassword, routes.twoFactorChallenge, routes.twoFactorSetup];

/** The pages kept as shells, from the app's pages: all but the never-kept ones and those with a dynamic segment
 * ("/roles/[key]"), which render per address and can't be fetched ahead (parentShellFor stands in); the offline page
 * always. */
export function shellsToKeep(appRoutes: readonly string[]): string[] {
  const shells = appRoutes.filter((route) => !route.includes("[") && !NEVER_KEPT.includes(route));
  return [...new Set([...shells, OFFLINE_PAGE])];
}

/** The key a page's shell is kept under: its address without query or fragment, so a token never reaches Cache
 * Storage, and one entry per page. The shells are static, so the query never changes their HTML. */
export function pageCacheKey(url: string): string {
  const { origin, pathname } = new URL(url);
  return origin + pathname;
}

export interface ResponseFacts {
  /** "basic" for an answer from the app's own origin. */
  type: string;
  ok: boolean;
  redirected: boolean;
  headers: { get: (name: string) => string | null };
}

/** Whether a fetched shell may be kept: the app's own HTML page, as asked for, and not rendered for one request
 * (Next.js marks a page rendered per request no-store, as it would one made for the person signed in). */
export function isKeepablePage(response: ResponseFacts): boolean {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const cacheControl = response.headers.get("cache-control")?.toLowerCase() ?? "";
  return (
    response.type === "basic" &&
    response.ok &&
    !response.redirected &&
    contentType.startsWith("text/html") &&
    !cacheControl.includes("no-store") &&
    // A browser never shows a worker Set-Cookie; this holds should one ever do.
    response.headers.get("set-cookie") === null
  );
}

/** Whether a file may be kept: the app's own, whole (Cache Storage refuses a 206). */
export function isKeepableFile(response: { type: string; status: number }): boolean {
  return response.type === "basic" && response.status === 200;
}

/** A build file or an icon, as a shell's HTML names it: in a tag's attribute, or inside the router's data, where its
 * quotes are escaped. */
const NAMED_FILE = /\/(?:_next\/static|icons)\/[^"'\\\s<>()]+/g;
const LEGACY_SCRIPT = /<script\b[^>]*\bnomodule\b[^>]*>/gi;

/** The files a shell needs offline: its scripts (also those named only in the router's data, which it loads on
 * hydration), styles, preloaded fonts and icons. Legacy (nomodule) scripts are left out: a browser with service
 * workers never runs them. */
export function filesNamedIn(html: string): string[] {
  const legacy = new Set([...html.matchAll(LEGACY_SCRIPT)].flatMap(([tag]) => tag.match(NAMED_FILE) ?? []));
  return [...new Set(html.match(NAMED_FILE) ?? [])].filter((file) => !legacy.has(file));
}

/**
 * For an address of a page with a dynamic segment, such as "/roles/sales" of "/roles/[key]", the kept page above it
 * ("/roles") that stands in offline: such a page renders per address and is never kept. Null for any other address.
 */
export function parentShellFor(pathname: string, appRoutes: readonly string[]): string | null {
  const shells = shellsToKeep(appRoutes);
  for (const route of appRoutes) {
    const segments = route.split("/");
    const dynamicAt = segments.findIndex((segment) => segment.startsWith("["));
    if (dynamicAt === -1 || !matchesRoute(pathname, segments)) continue;
    const parent = segments.slice(0, dynamicAt).join("/") || "/";
    if (shells.includes(parent)) return parent;
  }
  return null;
}

/** Whether an address is one of a page's: "/roles/sales" of "/roles/[key]". A dynamic segment takes any one segment. */
function matchesRoute(pathname: string, routeSegments: readonly string[]): boolean {
  const segments = pathname.split("/");
  return (
    segments.length === routeSegments.length &&
    routeSegments.every((segment, index) => {
      const part = segments[index] ?? "";
      return segment.startsWith("[") ? part !== "" : part === segment;
    })
  );
}
