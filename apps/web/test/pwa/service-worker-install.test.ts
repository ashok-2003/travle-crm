// @vitest-environment node
// The service worker as it ships, run against a stand-in site and Cache Storage (fake-app.ts): what it keeps when it
// installs (every screen's shell, so screens opened by the app's links work offline), how it answers for the build's
// files and the icons, and which caches it deletes when it takes over.
import { describe, expect, it } from "vitest";
import { app, at, bundledWorker, installed, PAGES, STATIC } from "./fake-app";
import { answer, startWorker } from "./worker-sandbox";

describe("installing", () => {
  it("keeps the shell of every screen and the build files each names, before any is opened", async () => {
    const worker = await installed();
    const pages = worker.storage.contents()[PAGES] ?? [];
    for (const screen of ["/", "/staff", "/roles", "/settings", "/account", "/sign-in", "/offline"]) {
      expect(pages, screen).toContain(at(screen));
    }
    expect(worker.storage.contents()[STATIC]).toContain(at("/_next/static/chunks/a.js"));
  });

  it("never keeps a page that handles a secret, or a role's page, which renders per address", async () => {
    const pages = (await installed()).storage.contents()[PAGES] ?? [];
    for (const page of ["/reset-password", "/sign-in/two-factor", "/two-factor-setup"]) {
      expect(pages).not.toContain(at(page));
    }
    expect(pages.some((url) => url.includes("/roles/"))).toBe(false);
  });

  it("fetches shells without cookies, so a kept copy can't hold anyone's data", async () => {
    const worker = await installed();
    const shellRequests = worker.requests.filter((request) => !request.url.includes("/_next/"));
    expect(shellRequests.length).toBeGreaterThan(5);
    for (const request of shellRequests) expect(request.credentials, request.url).toBe("omit");
  });

  it("fails without the offline page, so the browser tries again on a later visit", async () => {
    const site = app();
    const worker = startWorker(await bundledWorker(), (url) =>
      url.pathname === "/offline" ? answer("down", { status: 503 }) : site(url),
    );
    await expect(worker.install()).rejects.toThrow();
  });
});

describe("files", () => {
  it("answer a build file even when Cache Storage refuses to keep it", async () => {
    const worker = await installed();
    worker.storage.refuseWrites = true;
    const event = worker.fetch("/_next/static/chunks/new.js");
    expect(await (await event.answer)?.text()).toBe("file /_next/static/chunks/new.js");
    await expect(event.settled()).resolves.toBeUndefined();
  });

  it("ask the network first for icons, whose names stay when they change, and fall back to the kept copy", async () => {
    const worker = await installed();
    await worker.fetch("/icons/favicon.svg").settled();
    worker.site = () => answer("new icon");
    const fresh = worker.fetch("/icons/favicon.svg");
    expect(await (await fresh.answer)?.text()).toBe("new icon");
    await fresh.settled();
    worker.offline = true;
    expect(await (await worker.fetch("/icons/favicon.svg").answer)?.text()).toBe("new icon");
  });
});

describe("activating", () => {
  it("deletes its own older caches and no one else's", async () => {
    const worker = startWorker(await bundledWorker(), app());
    for (const name of ["pages-v1", "static-v1", "uploads"]) await worker.storage.open(name);
    await worker.install();
    await worker.activate();
    expect(Object.keys(worker.storage.contents()).sort()).toEqual([PAGES, STATIC, "uploads"]);
  });
});
