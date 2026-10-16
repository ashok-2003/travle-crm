// The service worker, bundled into public/sw.js by scripts/service-worker.ts with the app's page list. It keeps an
// offline shell: every static page (its shell), fetched by the worker itself without cookies, the build's files those
// shells name, and the icons. A page load's own answer is never kept, and every entry is put and looked up by its
// URL alone (shells.ts says why). strategy.ts decides how each request is answered, shells.ts what may be kept. It
// also shows web pushes, and opens a push's page when its notification is tapped (push.ts).
import { PUSH_ARRIVED } from "../notifications/push/push-message";
import { notificationFor, openFromNotification, tapTarget } from "./push";
import {
  fileCacheKey,
  filesNamedIn,
  filesNamedInStylesheet,
  isKeepableFile,
  isKeepablePage,
  pageCacheKey,
  parentShellFor,
  shellsToKeep,
} from "./shells";
import { CACHE_NAMES, cachesToDelete, NAVIGATION_TIMEOUT_MS, OFFLINE_PAGE, strategyFor } from "./strategy";

declare const self: ServiceWorkerGlobalScope;
/** The app's pages ("/staff", "/roles/[key]"), listed from src/app's page files when the worker is bundled. */
declare const APP_ROUTES: readonly string[];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await keepShells();
      // Without the offline page the install fails, and the browser tries again on a later visit.
      if (!(await savedShell(OFFLINE_PAGE))) throw new Error("The offline page couldn't be kept");
      // Take over at once: pages come from the network first, and a new build's shells and files replace the old
      // ones together (keepShells), so a new worker never mixes versions.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await Promise.all(cachesToDelete(await caches.keys()).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const strategy = strategyFor(event.request, self.location.origin);
  if (strategy === "page") event.respondWith(page(event));
  else if (strategy === "cache-first") event.respondWith(cacheFirst(event));
  else if (strategy === "network-first") event.respondWith(networkFirst(event));
  // "network-only": not answered here, so the browser fetches as if there were no worker.
});

// A push from the api's worker (spec 9.4): show it, and tell the app's open pages, so their bell asks again at once.
self.addEventListener("push", (event) => {
  const shown = notificationFor(event.data?.text() ?? null);
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(shown.title, shown.options),
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
        for (const client of windows) client.postMessage(PUSH_ARRIVED);
      }),
    ]),
  );
});

// A tap opens the push's page in the app, never another site, or brings forward a window already on it.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(openFromNotification(self.clients, tapTarget(event.notification.data, self.location.origin)));
});

const absolute = (path: string) => new URL(path, self.location.origin).href;

function savedShell(address: string): Promise<Response | undefined> {
  return caches.match(pageCacheKey(absolute(address)), { cacheName: CACHE_NAMES.pages });
}

/** A page load gets the network's answer whatever its status (a 401 or a 500 reaches the page); the saved shell when
 * the connection stalls; the fallbacks of offlineAnswer when there is none. */
async function page(event: FetchEvent): Promise<Response> {
  const network = fetch(event.request);
  // The network answered: check the shells in the background, as a new build replaces them.
  event.waitUntil(network.then((response) => (response.ok ? keepShells() : undefined)).catch(() => undefined));
  try {
    return await Promise.race([network, shellOnceStalled(event.request.url)]);
  } catch {
    return await offlineAnswer(event.request.url);
  }
}

/** The saved shell once a page load has waited NAVIGATION_TIMEOUT_MS. Without one it never settles: the page waits
 * for the network. */
async function shellOnceStalled(url: string): Promise<Response> {
  await new Promise((resolve) => setTimeout(resolve, NAVIGATION_TIMEOUT_MS));
  return (await savedShell(url)) ?? new Promise<never>(() => undefined);
}

/** Offline: the page's shell; for an address of a page that is never kept, such as a role's, a redirect to the kept
 * page above it, so the address shown matches the screen; else the offline page. */
async function offlineAnswer(url: string): Promise<Response> {
  const shell = await savedShell(url);
  if (shell) return shell;
  const parent = parentShellFor(new URL(url).pathname, APP_ROUTES);
  if (parent !== null && (await savedShell(parent))) return Response.redirect(absolute(parent), 302);
  return (await savedShell(OFFLINE_PAGE)) ?? Response.error();
}

/** The build's files, kept until a new build's shells name others (refreshShells). */
async function cacheFirst(event: FetchEvent): Promise<Response> {
  const key = fileCacheKey(event.request.url);
  const saved = await caches.match(key, { cacheName: CACHE_NAMES.static });
  if (saved) return saved;
  const response = await fetch(event.request);
  keepInBackground(event, key, response);
  return response;
}

/** The icons: from the network, so a changed icon shows; the kept copy offline. */
async function networkFirst(event: FetchEvent): Promise<Response> {
  const key = fileCacheKey(event.request.url);
  let response: Response;
  try {
    response = await fetch(event.request);
  } catch {
    return (await caches.match(key, { cacheName: CACHE_NAMES.static })) ?? Response.error();
  }
  keepInBackground(event, key, response);
  return response;
}

/** Keeps a copy without holding up the answer: a write that fails (storage full) leaves the answer as it was. */
function keepInBackground(event: FetchEvent, key: string, response: Response): void {
  if (!isKeepableFile(response)) return;
  const copy = response.clone();
  event.waitUntil(
    caches
      .open(CACHE_NAMES.static)
      .then((cache) => cache.put(key, copy))
      .catch(() => undefined),
  );
}

let keeping: Promise<void> | undefined;

/** Brings every shell and the files it names up to date; at install and after each page load the network answered.
 * One run at a time. */
function keepShells(): Promise<void> {
  keeping ??= refreshShells().finally(() => {
    keeping = undefined;
  });
  return keeping;
}

async function refreshShells(): Promise<void> {
  const [pages, files] = await Promise.all([caches.open(CACHE_NAMES.pages), caches.open(CACHE_NAMES.static)]);
  const keys = shellsToKeep(APP_ROUTES).map((path) => pageCacheKey(absolute(path)));
  const shells = await Promise.all(keys.map((key) => refreshShell(pages, key)));
  // A page no longer in the app leaves with its shell.
  await deleteAllBut(pages, new Set(keys));
  // Shells share most of their files: each is fetched once.
  const named = [
    ...new Set(
      shells
        .flatMap(({ html }) => (html === null ? [] : filesNamedIn(html)))
        .map((file) => fileCacheKey(absolute(file))),
    ),
  ];
  await Promise.all(named.map((file) => keepFile(files, file)));
  // A changed shell means a new build: the files neither its shells nor its stylesheets name were the old build's.
  // Fonts the stylesheets name stay without being fetched ahead (some 1.5 MB): a page loads one when it shows that
  // script.
  if (shells.some(({ changed }) => changed)) {
    const fonts = await Promise.all(named.map((file) => fontsNamedBy(files, file)));
    await deleteAllBut(files, new Set([...named, ...fonts.flat()]));
  }
}

/** The fonts a kept stylesheet names; nothing for any other file. */
async function fontsNamedBy(files: Cache, url: string): Promise<string[]> {
  if (!new URL(url).pathname.endsWith(".css")) return [];
  const css = await (await files.match(url))?.text();
  return css === undefined ? [] : filesNamedInStylesheet(css, url);
}

/**
 * Fetches a shell again and keeps it if it changed. Without cookies: a shell is the same for everyone, so the copy
 * kept can't hold anyone's data. "no-cache": the browser asks the server, which answers 304 when nothing changed.
 */
async function refreshShell(pages: Cache, key: string): Promise<{ html: string | null; changed: boolean }> {
  const kept = (await (await pages.match(key))?.text()) ?? null;
  const response = await fetch(key, { credentials: "omit", cache: "no-cache" }).catch(() => null);
  // Offline: the kept copy stays until a later page load the network answers.
  if (response === null) return { html: kept, changed: false };
  if (!isKeepablePage(response)) {
    // A failure (a 502 mid-deploy) leaves the kept copy. A page that is now something else (rendered per request,
    // redirected): the old copy would show an old build offline, so it goes.
    if (!response.ok) return { html: kept, changed: false };
    await pages.delete(key);
    return { html: null, changed: false };
  }
  const html = await response.clone().text();
  if (html === kept) return { html, changed: false };
  await pages.put(key, response);
  return { html, changed: true };
}

/** Keeps one build file a shell names, unless it is kept already (its name changes with its content). */
async function keepFile(files: Cache, url: string): Promise<void> {
  if (await files.match(url)) return;
  const response = await fetch(url, { credentials: "omit" }).catch(() => null);
  // Offline or storage full: the next refresh tries again.
  if (response && isKeepableFile(response)) await files.put(url, response).catch(() => undefined);
}

async function deleteAllBut(cache: Cache, urls: ReadonlySet<string>): Promise<void> {
  const unwanted = (await cache.keys()).filter(({ url }) => !urls.has(url));
  await Promise.all(unwanted.map((request) => cache.delete(request)));
}
