// The service worker is registered only by production builds (a worker caching development builds would serve stale
// code), for the whole app, and a browser without service workers simply gets none.
import { describe, expect, it, vi } from "vitest";
import { registerServiceWorker } from "@/pwa/register-service-worker";

describe("registerServiceWorker", () => {
  it("registers /sw.js for the whole app, never reading it from the HTTP cache", async () => {
    const register = vi.fn(() => Promise.resolve({}));
    await registerServiceWorker({ serviceWorker: { register } }, "production");
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
  });

  it("does nothing in development or without service worker support", async () => {
    const register = vi.fn(() => Promise.resolve({}));
    await registerServiceWorker({ serviceWorker: { register } }, "development");
    await registerServiceWorker({}, "production");
    expect(register).not.toHaveBeenCalled();
  });

  it("keeps the app working when registration fails", async () => {
    const register = vi.fn(() => Promise.reject(new Error("SecurityError")));
    await expect(registerServiceWorker({ serviceWorker: { register } }, "production")).resolves.toBe(false);
  });
});
