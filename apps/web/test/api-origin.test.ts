// next.config.ts as Next.js loads it. The rewrites (spec 3) go to API_ORIGIN and CONSOLE_ORIGIN, checked when the app
// is built: a production build without one gets no rewrite to it, never a silent one to localhost. The console's
// /api/platform comes before the api's /api, which would match it too. The header rules put the token pages' referrer
// policy after the catch-all, so it wins.
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { TOKEN_PAGES } from "../security-headers";

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

/** The api's three rewrites: its tRPC and sign-in, the share links and the webhooks (both opened on the app's address). */
const apiRewrites = (origin: string) => [
  { source: "/api/:path*", destination: `${origin}/api/:path*` },
  { source: "/p/:path*", destination: `${origin}/p/:path*` },
  { source: "/webhooks/:path*", destination: `${origin}/webhooks/:path*` },
];

const consoleRewrite = (origin: string) => ({
  source: "/api/platform/:path*",
  destination: `${origin}/api/platform/:path*`,
});

describe("the rewrites", () => {
  it("aren't made in a production build without the origins: the load balancer routes them", async () => {
    expect(await rewritesWith({ NODE_ENV: "production", API_ORIGIN: undefined, CONSOLE_ORIGIN: undefined })).toEqual(
      [],
    );
    expect(await rewritesWith({ NODE_ENV: "production", API_ORIGIN: "", CONSOLE_ORIGIN: "" })).toEqual([]);
  });

  it("go to the api and the console beside the app in development, the console's first", async () => {
    expect(await rewritesWith({ NODE_ENV: "development", API_ORIGIN: undefined, CONSOLE_ORIGIN: undefined })).toEqual([
      consoleRewrite("http://localhost:3002"),
      ...apiRewrites("http://localhost:3001"),
    ]);
  });

  it("go to API_ORIGIN and CONSOLE_ORIGIN when they are set, written as origins", async () => {
    expect(
      await rewritesWith({
        NODE_ENV: "production",
        API_ORIGIN: "http://127.0.0.1:4000/",
        CONSOLE_ORIGIN: "http://127.0.0.1:4002/",
      }),
    ).toEqual([consoleRewrite("http://127.0.0.1:4002"), ...apiRewrites("http://127.0.0.1:4000")]);
  });

  it("leave the console out of a production build without CONSOLE_ORIGIN", async () => {
    expect(
      await rewritesWith({ NODE_ENV: "production", API_ORIGIN: "http://127.0.0.1:4000", CONSOLE_ORIGIN: undefined }),
    ).toEqual(apiRewrites("http://127.0.0.1:4000"));
  });

  it("refuse an origin that isn't an http(s) origin, when the app is built", async () => {
    for (const value of ["localhost:3001", "ftp://api.internal", "http://api.internal/v1", "not a url"]) {
      await expect(configWith({ NODE_ENV: "production", API_ORIGIN: value }), value).rejects.toThrow(/API_ORIGIN/);
      await expect(
        configWith({ NODE_ENV: "production", API_ORIGIN: undefined, CONSOLE_ORIGIN: value }),
        value,
      ).rejects.toThrow(/CONSOLE_ORIGIN/);
    }
  });
});

describe("the header rules", () => {
  it("come after the catch-all for the token pages", async () => {
    const config = await configWith({ NODE_ENV: "production" });
    const sources = (config.headers ? await config.headers() : []).map((rule) => rule.source);
    for (const page of TOKEN_PAGES) {
      expect(sources.indexOf(page), page).toBeGreaterThan(sources.indexOf("/:path*"));
    }
  });
});
