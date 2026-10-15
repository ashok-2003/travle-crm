// The service worker, bundled into public/sw.js by scripts/service-worker.ts. It keeps an offline shell: the pages
// visited, the build's files and the icons, and the offline page. strategy.ts decides how each request is answered.
import { CACHE_NAMES, cachesToDelete, OFFLINE_PAGE, strategyFor } from "./strategy";

declare const self: ServiceWorkerGlobalScope;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await (await caches.open(CACHE_NAMES.pages)).add(OFFLINE_PAGE);
      // Take over at once: pages come from the network first and the build's files are named by their content, so
      // a new worker never mixes versions.
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
  if (strategy === "cache-first") event.respondWith(cacheFirst(event.request));
  else if (strategy === "page") event.respondWith(page(event.request));
  // "network-only": not answered here, so the browser fetches as if there were no worker.
});

async function cacheFirst(request: Request): Promise<Response> {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await (await caches.open(CACHE_NAMES.static)).put(request, response.clone());
  return response;
}

async function page(request: Request): Promise<Response> {
  try {
    const response = await fetch(request);
    if (response.ok) await (await caches.open(CACHE_NAMES.pages)).put(request, response.clone());
    return response;
  } catch {
    return (
      (await caches.match(request, { cacheName: CACHE_NAMES.pages })) ??
      (await caches.match(OFFLINE_PAGE, { cacheName: CACHE_NAMES.pages })) ??
      Response.error()
    );
  }
}
