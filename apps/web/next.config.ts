// Next.js settings. The output is a standalone Node server for a container (spec 12.3), so nothing here is
// specific to one host.
import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { securityHeaderRules } from "./security-headers";

const production = process.env.NODE_ENV === "production";

/** An origin setting as a bare origin ("http://127.0.0.1:4000/" gives "http://127.0.0.1:4000"), or the build fails. */
function checkedOrigin(name: string, value: string, example: string): string {
  const url = URL.parse(value);
  const isOrigin =
    url !== null && (url.protocol === "http:" || url.protocol === "https:") && url.href === `${url.origin}/`;
  if (!isOrigin) throw new Error(`${name} must be an http(s) origin such as ${example}, not "${value}"`);
  return url.origin;
}

/**
 * Where a rewrite goes (spec 3): the browser always calls the api and the console on the address it loaded the app
 * from, so cookies stay first-party and neither needs CORS. Rewrites are fixed when the app is built, so this is for
 * development and the end-to-end tests. A deployment routes these paths at its load balancer, before Next.js sees the
 * request, so a production build without the setting has no rewrite to it at all: a request that reaches the app is a
 * 404, never one quietly sent to whatever listens on localhost.
 */
function originSetting(name: "API_ORIGIN" | "CONSOLE_ORIGIN", developmentDefault: string): string | null {
  const value = process.env[name];
  if (value) return checkedOrigin(name, value, developmentDefault);
  return production ? null : developmentDefault;
}

/** The api: its tRPC and sign-in at /api, and the share links (/p) and webhooks it serves on the app's address. */
const apiOrigin = originSetting("API_ORIGIN", "http://localhost:3001");
/** The console process (ADR 0019): the console's tRPC at /api/platform/trpc. */
const consoleOrigin = originSetting("CONSOLE_ORIGIN", "http://localhost:3002");

/** The console's rewrite comes first: /api/platform/... matches /api/:path* too, which would send it to the api. */
function rewrites() {
  const toConsole =
    consoleOrigin === null
      ? []
      : [{ source: "/api/platform/:path*", destination: `${consoleOrigin}/api/platform/:path*` }];
  const toApi =
    apiOrigin === null
      ? []
      : ["/api", "/p", "/webhooks"].map((prefix) => ({
          source: `${prefix}/:path*`,
          destination: `${apiOrigin}${prefix}/:path*`,
        }));
  return [...toConsole, ...toApi];
}

/** Changes with every build (or set CACHE_VERSION), so the browser drops a query cache an older build saved. */
const cacheVersion = process.env.CACHE_VERSION ?? String(Date.now());

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  // `next dev` would write an AGENTS.md here when an AI agent runs it; the repo's guidance is CLAUDE.md.
  agentRules: false,
  // No image optimization endpoint: the app shows no remote images, and the endpoint is work and attack surface.
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_CACHE_VERSION: cacheVersion },
  // Tailwind's own Turbopack loader compiles every stylesheet (no PostCSS step).
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
      "*.ts": {
        condition: { path: /^packages\/[^/]+\/src\// },
        loaders: [path.join(import.meta.dirname, "turbopack/workspace-imports-loader.cjs")],
        as: "*.ts",
      },
    },
  },
  headers: () =>
    Promise.resolve([
      ...securityHeaderRules({ development: process.env.NODE_ENV === "development" }),
      // The browser checks for a new worker on every visit; the worker's scope is the whole app.
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ]),
  rewrites: () => Promise.resolve(rewrites()),
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
