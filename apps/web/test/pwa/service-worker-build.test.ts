// @vitest-environment node
// The service worker refreshes its shells for a new build only, and a few at a time: a page load of the same build
// starts no shell fetch, and no refresh has more than four fetches in flight.
import { describe, expect, it } from "vitest";
import { bundleServiceWorker, currentBuildId } from "../../scripts/service-worker";
import { BUILD_ID_PATH, SHELL_FETCH_CONCURRENCY } from "@/service-worker/shells";
import { app, at, bundledWorker, installed, PAGES, pageLoad } from "./fake-app";
import { answer, startWorker } from "./worker-sandbox";

const appDirectory = new URL("../..", import.meta.url).pathname;

describe("the bundled worker", () => {
  it("carries the build id, so sw.js differs between two builds", async () => {
    const first = await bundleServiceWorker(appDirectory, "build-one");
    const second = await bundleServiceWorker(appDirectory, "build-two");
    expect(first).toContain("build-one");
    expect(second).toContain("build-two");
    expect(first).not.toBe(second);
  });

  it("names a build when nothing else does: new for every build", () => {
    expect(currentBuildId(["/"]).length).toBeGreaterThan(0);
  });
});

describe("page loads of the same build", () => {
  it("start no shell fetch, and never wait on the shells", async () => {
    const worker = await installed();
    expect(await worker.storage.text(PAGES, at(BUILD_ID_PATH))).toBe("build-1");
    const before = worker.requests.length;
    await pageLoad(worker, "/staff");
    expect(worker.requests.slice(before).map(({ url }) => url)).toEqual([at("/staff")]);
  });
});

describe("page loads of a new build", () => {
  it("refresh the shells, then remember the build so the next load starts none", async () => {
    const worker = await installed(app("a"), "build-1");
    // The same stored shells, now read by the worker of build 2 (a deploy installs it, which refreshes at once; here
    // the build is changed under the worker instead).
    await worker.storage.caches.get(PAGES)?.put(at(BUILD_ID_PATH), new Response("build-0"));
    worker.site = app("b");
    await pageLoad(worker, "/");
    expect(await worker.storage.text(PAGES, at("/settings"))).toContain("build b");
    expect(await worker.storage.text(PAGES, at(BUILD_ID_PATH))).toBe("build-1");
    const before = worker.requests.length;
    await pageLoad(worker, "/");
    expect(worker.requests.length - before).toBe(1);
  });

  it("try again on the next load when the refresh was cut short", async () => {
    const worker = await installed(app("a"));
    await worker.storage.caches.get(PAGES)?.put(at(BUILD_ID_PATH), new Response("build-0"));
    const site = app("b");
    worker.site = (url) => (url.pathname === "/staff" ? answer("bad gateway", { status: 502 }) : site(url));
    await pageLoad(worker, "/");
    expect(await worker.storage.text(PAGES, at(BUILD_ID_PATH))).toBe("build-0");
    worker.site = site;
    await pageLoad(worker, "/");
    expect(await worker.storage.text(PAGES, at(BUILD_ID_PATH))).toBe("build-1");
  });

  it("fetch at most four shells or files at once", async () => {
    const site = app();
    let inFlight = 0;
    let peak = 0;
    const slow: typeof site = async (url) => {
      if (url.pathname === "/") return site(url);
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      inFlight--;
      return site(url);
    };
    const worker = startWorker(await bundledWorker(), slow);
    await worker.install();
    expect(worker.requests.length).toBeGreaterThan(SHELL_FETCH_CONCURRENCY * 2);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(SHELL_FETCH_CONCURRENCY);
  });
});
