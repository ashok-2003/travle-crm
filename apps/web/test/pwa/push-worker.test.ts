// @vitest-environment node
// The service worker as it ships (fake-app.ts bundles it) receiving a push and the tap on its notification: it shows
// the notification, tells the app's open pages so their bell asks again, and a tap opens the push's page in the app
// or brings forward a window already on it, never another site. Run like worker-sandbox.ts runs the worker, with the
// stand-ins a push needs besides: the registration's notifications and the app's windows.
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { PUSH_ARRIVED } from "@/notifications/push/push-message";
import { at, bundledWorker } from "./fake-app";
import { MemoryCacheStorage, ORIGIN, WorkerEvent } from "./worker-sandbox";

interface AppWindow {
  url: string;
  told: unknown[];
  focus: () => Promise<AppWindow>;
  navigate: (url: string) => Promise<AppWindow>;
  postMessage: (message: unknown) => void;
}

function appWindow(url: string): AppWindow {
  const window: AppWindow = {
    url,
    told: [],
    focus: vi.fn(() => Promise.resolve(window)),
    navigate: vi.fn((to: string) => Promise.resolve({ ...window, url: to })),
    postMessage: (message) => window.told.push(message),
  };
  return window;
}

/** The worker, started with these windows of the app open: what it shows and opens, and ways to push and tap. */
async function pushWorker(windows: AppWindow[] = []) {
  const listeners = new Map<string, (event: WorkerEvent) => void>();
  const shown: [string, unknown][] = [];
  const opened: string[] = [];
  const scope = {
    location: new URL("/sw.js", ORIGIN),
    addEventListener: (type: string, listener: (event: WorkerEvent) => void) => listeners.set(type, listener),
    skipWaiting: () => Promise.resolve(),
    registration: {
      showNotification: (title: string, options: unknown) => {
        shown.push([title, options]);
        return Promise.resolve();
      },
    },
    clients: {
      claim: () => Promise.resolve(),
      matchAll: () => Promise.resolve(windows),
      openWindow: (url: string) => {
        opened.push(url);
        return Promise.resolve(null);
      },
    },
  };
  vm.runInNewContext(await bundledWorker(), {
    self: scope,
    caches: new MemoryCacheStorage(),
    fetch: () => Promise.reject(new TypeError("Failed to fetch")),
    Response,
    Request,
    Headers,
    URL,
    console,
    setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay),
  });
  async function dispatch(type: string, properties: object): Promise<void> {
    const event = Object.assign(new WorkerEvent(), properties);
    listeners.get(type)?.(event);
    await event.settled();
  }
  const close = vi.fn();
  return {
    shown,
    opened,
    close,
    push: (payload: string | null) => dispatch("push", { data: payload === null ? null : { text: () => payload } }),
    tap: (data: unknown) => dispatch("notificationclick", { notification: { data, close } }),
  };
}

const payload = JSON.stringify({
  title: "Opened: Quotation SAMPLE-2026-0001",
  body: "The link you shared has just been opened.",
  url: "/settings/documents",
});

describe("a push", () => {
  it("shows its notification, and tells the app's open pages", async () => {
    const open = [appWindow(at("/")), appWindow(at("/staff"))];
    const worker = await pushWorker(open);
    await worker.push(payload);
    expect(worker.shown).toEqual([
      [
        "Opened: Quotation SAMPLE-2026-0001",
        expect.objectContaining({
          body: "The link you shared has just been opened.",
          data: { path: "/settings/documents" },
        }),
      ],
    ]);
    expect(open.map(({ told }) => told)).toEqual([[PUSH_ARRIVED], [PUSH_ARRIVED]]);
  });

  it("still shows a notification when its payload can't be read", async () => {
    const worker = await pushWorker();
    await worker.push(null);
    expect(worker.shown).toHaveLength(1);
  });
});

describe("a tap on the notification", () => {
  it("closes it and opens its page in the app", async () => {
    const worker = await pushWorker();
    await worker.tap({ path: "/settings/documents" });
    expect(worker.close).toHaveBeenCalledOnce();
    expect(worker.opened).toEqual([at("/settings/documents")]);
  });

  it("brings forward a window already on that page", async () => {
    const there = appWindow(at("/settings/documents"));
    const worker = await pushWorker([there]);
    await worker.tap({ path: "/settings/documents" });
    expect(there.focus).toHaveBeenCalledOnce();
    expect(worker.opened).toEqual([]);
  });

  it("opens home for anything but a path in the app", async () => {
    const worker = await pushWorker();
    await worker.tap({ path: "https://evil.example/settings" });
    expect(worker.opened).toEqual([at("/")]);
  });
});
