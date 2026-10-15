// next.config.ts as Next.js loads it. The /api rewrite (spec 3) goes to API_ORIGIN, checked when the app is built: a
// production build without one gets no rewrite, never a silent one to localhost. The header rules put the
// no-referrer pages after the catch-all, so their policy wins.
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { NO_REFERRER_PAGES } from "../security-headers";

async function configWith(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  return (await import("../next.config")).default;
}

async function rewritesWith(env: Record<string, string | undefined>) {
  const config = await configWith(env);
  return config.rewrites ? await config.rewrites() : [];
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the /api rewrite", () => {
  it("isn't made in a production build without API_ORIGIN: the load balancer routes /api", async () => {
    expect(await rewritesWith({ NODE_ENV: "production", API_ORIGIN: undefined })).toEqual([]);
    expect(await rewritesWith({ NODE_ENV: "production", API_ORIGIN: "" })).toEqual([]);
  });

  it("goes to the api beside the app in development", async () => {
    expect(await rewritesWith({ NODE_ENV: "development", API_ORIGIN: undefined })).toEqual([
      { source: "/api/:path*", destination: "http://localhost:3001/api/:path*" },
    ]);
  });

  it("goes to API_ORIGIN when it is set, written as an origin", async () => {
    expect(await rewritesWith({ NODE_ENV: "production", API_ORIGIN: "http://127.0.0.1:4000/" })).toEqual([
      { source: "/api/:path*", destination: "http://127.0.0.1:4000/api/:path*" },
    ]);
  });

  it("refuses an API_ORIGIN that isn't an http(s) origin, when the app is built", async () => {
    for (const value of ["localhost:3001", "ftp://api.internal", "http://api.internal/v1", "not a url"]) {
      await expect(configWith({ NODE_ENV: "production", API_ORIGIN: value }), value).rejects.toThrow(/API_ORIGIN/);
    }
  });
});

describe("the header rules", () => {
  it("come after the catch-all for the no-referrer pages", async () => {
    const config = await configWith({ NODE_ENV: "production" });
    const sources = (config.headers ? await config.headers() : []).map((rule) => rule.source);
    for (const page of NO_REFERRER_PAGES) {
      expect(sources.indexOf(page), page).toBeGreaterThan(sources.indexOf("/:path*"));
    }
  });
});
