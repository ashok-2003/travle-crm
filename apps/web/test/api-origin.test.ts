// next.config.ts as Next.js loads it. The rewrites (spec 3) go to API_ORIGIN and CONSOLE_ORIGIN, checked when the app
// is built: a production build without one gets no rewrite to it, never a silent one to localhost. The console's
// /api/platform comes before the api's /api, which would match it too. STORAGE_ORIGIN joins the policy, local MinIO in
// development, and a production build refuses to go without it. The header rules put the token pages' referrer policy
// after the catch-all, so it wins.
// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
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

describe("the storage origin", () => {
  const policyWith = async (env: Record<string, string | undefined>) => {
    const config = await configWith(env);
    const rules = config.headers ? await config.headers() : [];
    const pages = rules.find((rule) => rule.headers.some((header) => header.key === "Content-Security-Policy"));
    return pages?.headers.find((header) => header.key === "Content-Security-Policy")?.value ?? "";
  };

  it("joins the policy's connect-src and img-src, for uploads and images straight from storage", async () => {
    const policy = await policyWith({ NODE_ENV: "production", STORAGE_ORIGIN: "https://files.example.in/" });
    expect(policy).toContain("connect-src 'self' https://files.example.in;");
    expect(policy).toContain("img-src 'self' data: blob: https://files.example.in;");
  });

  it("is local MinIO in development: the origin of .env.example's S3_ENDPOINT, as docker-compose publishes it", async () => {
    const example = readFileSync(path.resolve(import.meta.dirname, "../../../.env.example"), "utf8");
    const endpoint = /^S3_ENDPOINT=(.+)$/m.exec(example)?.[1] ?? "";
    expect(endpoint).not.toBe("");
    expect(await policyWith({ NODE_ENV: "development", STORAGE_ORIGIN: undefined })).toContain(
      `connect-src 'self' ${new URL(endpoint).origin};`,
    );
  });

  it("is required by a production build, whose policy would otherwise block every upload and logo", async () => {
    for (const value of [undefined, ""]) {
      await expect(policyWith({ NODE_ENV: "production", STORAGE_ORIGIN: value }), String(value)).rejects.toThrow(
        /STORAGE_ORIGIN/,
      );
    }
  });

  it("is refused when it isn't an http(s) origin, when the app is built", async () => {
    await expect(configWith({ NODE_ENV: "production", STORAGE_ORIGIN: "files.example.in" })).rejects.toThrow(
      /STORAGE_ORIGIN/,
    );
  });
});

describe("the header rules", () => {
  it("come after the catch-all for the token pages", async () => {
    const config = await configWith({ NODE_ENV: "production", STORAGE_ORIGIN: "https://files.example.in" });
    const sources = (config.headers ? await config.headers() : []).map((rule) => rule.source);
    for (const page of TOKEN_PAGES) {
      expect(sources.indexOf(page), page).toBeGreaterThan(sources.indexOf("/:path*"));
    }
  });
});
