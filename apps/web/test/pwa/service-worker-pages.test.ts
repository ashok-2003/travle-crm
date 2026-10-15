// @vitest-environment node
// Page loads through the service worker as it ships (fake-app.ts): online it hands over the network's answer and
// never keeps it (no api answer, no token), then checks its shells for a new build; offline it answers every screen
// from its shell; on a stalled connection it shows the shell after 4 seconds.
import { afterEach, describe, expect, it, vi } from "vitest";
import { app, at, installed, PAGES, pageLoad, STATIC } from "./fake-app";
import { answer } from "./worker-sandbox";

afterEach(() => {
  vi.useRealTimers();
});

describe("page loads online", () => {
  it("never keep their own answer: an api answer opened as a page, in any case, is left to the network", async () => {
    const worker = await installed();
    for (const path of ["/API/trpc/staff.list", "/Api/trpc/me.get", "/api/trpc/me.get"]) {
      expect(worker.fetch(path, { mode: "navigate" }).answer, path).toBeUndefined();
    }
    const kept = Object.values(worker.storage.contents()).flat();
    expect(kept.some((url) => /\/api(\/|$)/i.test(new URL(url).pathname))).toBe(false);
  });

  it("never put an address's query, such as a reset token, into Cache Storage", async () => {
    const worker = await installed();
    const response = await pageLoad(worker, "/reset-password?token=secret-token");
    expect(await response?.text()).toContain("/reset-password of build a");
    const kept = Object.values(worker.storage.contents()).flat();
    expect(kept.filter((url) => url.includes("token") || new URL(url).search !== "")).toEqual([]);
    expect(kept).not.toContain(at("/reset-password"));
  });

  it("hand over the network's answer whatever its status, and keep only HTML pages", async () => {
    const worker = await installed();
    expect((await pageLoad(worker, "/nowhere"))?.status).toBe(404);
    for (const url of worker.storage.contents()[PAGES] ?? []) {
      const kept = await worker.storage.caches.get(PAGES)?.match(url);
      expect(kept?.headers.get("content-type"), url).toMatch(/^text\/html/);
    }
  });

  it("check every shell again afterwards: a new build's shells and files replace the old ones", async () => {
    const worker = await installed(app("a"));
    worker.site = app("b");
    await pageLoad(worker, "/");
    expect(await worker.storage.text(PAGES, at("/settings"))).toContain("build b");
    expect(worker.storage.contents()[STATIC]).toContain(at("/_next/static/chunks/b.js"));
    expect(worker.storage.contents()[STATIC]).not.toContain(at("/_next/static/chunks/a.js"));
    // Asked as "no-cache": the server says whether a shell changed (a 304 when it didn't).
    expect(worker.requests.filter((request) => request.url === at("/settings")).at(-1)?.cache).toBe("no-cache");
  });

  it("keep a shell the server failed to give again, as during a deploy", async () => {
    const worker = await installed();
    const site = app();
    worker.site = (url) => (url.pathname === "/staff" ? answer("bad gateway", { status: 502 }) : site(url));
    await pageLoad(worker, "/");
    expect(await worker.storage.text(PAGES, at("/staff"))).toContain("/staff of build a");
  });

  it("drop a shell whose page now renders per request, which an old copy would show from an old build", async () => {
    const worker = await installed();
    const site = app();
    const perRequest = { "content-type": "text/html", "cache-control": "private, no-store" };
    worker.site = (url) => (url.pathname === "/staff" ? answer("per request", { headers: perRequest }) : site(url));
    await pageLoad(worker, "/");
    expect(worker.storage.contents()[PAGES]).not.toContain(at("/staff"));
  });

  it("keep the build's other files when no shell changed", async () => {
    const worker = await installed();
    await worker.fetch("/_next/static/chunks/dialog.js").settled();
    await pageLoad(worker, "/");
    expect(worker.storage.contents()[STATIC]).toContain(at("/_next/static/chunks/dialog.js"));
  });
});

describe("page loads offline", () => {
  it("open every screen from its shell, a screen never opened included, whatever the address's query", async () => {
    const worker = await installed();
    worker.offline = true;
    expect(await (await pageLoad(worker, "/settings"))?.text()).toContain("/settings of build a");
    expect(await (await pageLoad(worker, "/staff?view=all"))?.text()).toContain("/staff of build a");
  });

  it("send a role's page to the roles list, the screen above it, as a role's page is never kept", async () => {
    const worker = await installed();
    worker.offline = true;
    const response = await pageLoad(worker, "/roles/sales");
    expect(response?.status).toBe(302);
    expect(response?.headers.get("location")).toBe(at("/roles"));
  });

  it("show the offline page for an address with no shell, a never-kept page included", async () => {
    const worker = await installed();
    worker.offline = true;
    for (const path of ["/nowhere", "/reset-password?token=secret-token", "/sign-in/two-factor"]) {
      expect(await (await pageLoad(worker, path))?.text(), path).toContain("/offline of build a");
    }
  });
});

describe("page loads on a stalled connection", () => {
  it("get the saved shell after 4 seconds", async () => {
    const worker = await installed();
    vi.useFakeTimers();
    worker.site = () => new Promise<never>(() => undefined);
    const event = worker.fetch("/staff", { mode: "navigate" });
    let answered = false;
    void event.answer?.then(() => (answered = true));
    await vi.advanceTimersByTimeAsync(3_900);
    expect(answered).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(await (await event.answer)?.text()).toContain("/staff of build a");
  });

  it("wait for the network when there is no shell to show", async () => {
    const worker = await installed();
    vi.useFakeTimers();
    let arrive: (response: Response) => void = () => undefined;
    worker.site = () => new Promise<Response>((resolve) => (arrive = resolve));
    const event = worker.fetch("/nowhere", { mode: "navigate" });
    await vi.advanceTimersByTimeAsync(10_000);
    arrive(answer("late but here", { headers: { "content-type": "text/html" } }));
    expect(await (await event.answer)?.text()).toBe("late but here");
  });
});
