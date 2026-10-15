// Runs the bundled service worker (what public/sw.js holds, with the app's real page list) in a sandbox with
// stand-ins for a worker's world: Cache Storage in memory, a fake site behind fetch, and events whose respondWith and
// waitUntil the tests can await. Only what src/service-worker/sw.ts uses is modelled, plus what a real Cache Storage
// keeps that matters here: the Request an entry was put with, referrer included.
import vm from "node:vm";

export const ORIGIN = "https://app.example.in";

interface RequestLike {
  url: string;
  method?: string;
  mode?: string;
  credentials?: string;
  cache?: string;
  /** The page that asked, as a browser sets it on a page's own requests. */
  referrer?: string;
}

/** What the fake site answers for a URL; it may never settle, as on a stalled connection. */
export type SiteAnswer = (url: URL) => Response | Promise<Response>;

/** An answer as fetch gives it for the app's own origin: type "basic". */
export function answer(
  body: string,
  {
    status = 200,
    headers = {},
    redirected = false,
  }: { status?: number; headers?: Record<string, string>; redirected?: boolean } = {},
): Response {
  const response = new Response(body, { status, headers });
  Object.defineProperty(response, "type", { value: "basic" });
  Object.defineProperty(response, "redirected", { value: redirected });
  return response;
}

const urlOf = (request: RequestLike | string) =>
  typeof request === "string" ? new URL(request, ORIGIN).href : request.url;

class MemoryCache {
  /** By URL: the Request as put (a URL string becomes a Request of its own, with no page's referrer) and the answer. */
  readonly entries = new Map<string, { request: RequestLike; response: Response }>();
  constructor(private readonly storage: MemoryCacheStorage) {}
  match(request: RequestLike | string) {
    return Promise.resolve(this.entries.get(urlOf(request))?.response.clone());
  }
  put(request: RequestLike | string, response: Response) {
    if (this.storage.refuseWrites) return Promise.reject(new Error("QuotaExceededError"));
    this.entries.set(urlOf(request), {
      request: typeof request === "string" ? { url: urlOf(request) } : request,
      response,
    });
    return Promise.resolve();
  }
  keys() {
    return Promise.resolve([...this.entries.values()].map(({ request }) => request));
  }
  delete(request: RequestLike | string) {
    return Promise.resolve(this.entries.delete(urlOf(request)));
  }
}

export class MemoryCacheStorage {
  readonly caches = new Map<string, MemoryCache>();
  /** Set to make every write fail, as when storage is full. */
  refuseWrites = false;
  open(name: string) {
    const cache = this.caches.get(name) ?? new MemoryCache(this);
    this.caches.set(name, cache);
    return Promise.resolve(cache);
  }
  keys() {
    return Promise.resolve([...this.caches.keys()]);
  }
  delete(name: string) {
    return Promise.resolve(this.caches.delete(name));
  }
  async match(request: RequestLike | string, options: { cacheName?: string } = {}) {
    const caches = options.cacheName === undefined ? [...this.caches.values()] : [this.caches.get(options.cacheName)];
    for (const cache of caches) {
      const found = await cache?.match(request);
      if (found) return found;
    }
    return undefined;
  }
  /** Every URL kept, by cache name. */
  contents(): Record<string, string[]> {
    return Object.fromEntries([...this.caches].map(([name, cache]) => [name, [...cache.entries.keys()]]));
  }
  /** Every Request kept, in every cache, as it was put. */
  storedRequests(): RequestLike[] {
    return [...this.caches.values()].flatMap((cache) => [...cache.entries.values()].map(({ request }) => request));
  }
  /** The kept answer's text, if there is one. */
  async text(cacheName: string, url: string): Promise<string | undefined> {
    return (await this.caches.get(cacheName)?.match(url))?.text();
  }
}

/** An install, activate or fetch event: what the worker passed to respondWith and waitUntil. */
export class WorkerEvent {
  answer: Promise<Response> | undefined;
  private readonly pending: Promise<unknown>[] = [];
  constructor(readonly request?: RequestLike) {}
  respondWith(answer: Promise<Response>) {
    this.answer = answer;
  }
  waitUntil(promise: Promise<unknown>) {
    this.pending.push(promise);
  }
  /** Waits for everything the event started: the answer, as a real event's lifetime includes it, then background
   * work (an array's iterator also reaches promises added while it waits). A failed answer is the page's to see. */
  async settled(): Promise<void> {
    await this.answer?.catch(() => undefined);
    for (const promise of this.pending) await promise;
  }
}

export interface Worker {
  storage: MemoryCacheStorage;
  /** Every request the worker sent to the network. */
  requests: RequestLike[];
  /** While true, every fetch fails as it does without a connection. */
  offline: boolean;
  site: SiteAnswer;
  install(): Promise<WorkerEvent>;
  activate(): Promise<WorkerEvent>;
  /** A fetch event; mode "navigate" is a page load. It settles nothing: await answer or settled(). */
  fetch(path: string, request?: { mode?: string; method?: string; referrer?: string }): WorkerEvent;
}

export function startWorker(code: string, site: SiteAnswer): Worker {
  const listeners = new Map<string, (event: WorkerEvent) => void>();
  const worker: Worker = {
    storage: new MemoryCacheStorage(),
    requests: [],
    offline: false,
    site,
    install: () => dispatch("install", new WorkerEvent()),
    activate: () => dispatch("activate", new WorkerEvent()),
    fetch: (path, { mode = "no-cors", method = "GET", referrer = `${ORIGIN}/` } = {}) => {
      const event = new WorkerEvent({ url: new URL(path, ORIGIN).href, method, mode, referrer });
      listeners.get("fetch")?.(event);
      return event;
    },
  };
  async function dispatch(type: string, event: WorkerEvent): Promise<WorkerEvent> {
    listeners.get(type)?.(event);
    await event.settled();
    return event;
  }
  const fetch = (input: RequestLike | string, init: Omit<RequestLike, "url"> = {}) => {
    const request = typeof input === "string" ? { url: new URL(input, ORIGIN).href, ...init } : { ...input, ...init };
    worker.requests.push(request);
    if (worker.offline) return Promise.reject(new TypeError("Failed to fetch"));
    return Promise.resolve(worker.site(new URL(request.url)));
  };
  const scope = {
    location: new URL("/sw.js", ORIGIN),
    addEventListener: (type: string, listener: (event: WorkerEvent) => void) => listeners.set(type, listener),
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
  };
  vm.runInNewContext(code, {
    self: scope,
    caches: worker.storage,
    fetch,
    Response,
    Request,
    Headers,
    URL,
    console,
    // Read at call time, so a test's fake timers apply.
    setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay),
  });
  return worker;
}
