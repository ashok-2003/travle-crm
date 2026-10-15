// The service worker is registered only by production builds (a worker caching development builds would serve stale
// code), for the whole app; development removes one a production build left on the same address; a browser without
// service workers simply gets none, and a failed registration says why in the console.
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerServiceWorker } from "@/pwa/register-service-worker";

const noRegistrations = () => Promise.resolve([]);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("registerServiceWorker", () => {
  it("registers /sw.js for the whole app, never reading it from the HTTP cache", async () => {
    const register = vi.fn(() => Promise.resolve({}));
    await registerServiceWorker({ serviceWorker: { register, getRegistrations: noRegistrations } }, "production");
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
  });

  it("does nothing in development or without service worker support", async () => {
    const register = vi.fn(() => Promise.resolve({}));
    await registerServiceWorker({ serviceWorker: { register, getRegistrations: noRegistrations } }, "development");
    await registerServiceWorker({}, "production");
    expect(register).not.toHaveBeenCalled();
  });

  it("removes, in development, a worker a production build on the same address left behind", async () => {
    const unregister = vi.fn(() => Promise.resolve(true));
    const getRegistrations = () => Promise.resolve([{ unregister }]);
    await registerServiceWorker({ serviceWorker: { register: vi.fn(), getRegistrations } }, "development");
    expect(unregister).toHaveBeenCalledOnce();
  });

  it("keeps the app working when registration fails, and says why once in the console", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const register = vi.fn(() => Promise.reject(new Error("A bad HTTP response code (404) was received")));
    await expect(
      registerServiceWorker({ serviceWorker: { register, getRegistrations: noRegistrations } }, "production"),
    ).resolves.toBe(false);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.join(" ")).toContain("A bad HTTP response code (404)");
  });
});
