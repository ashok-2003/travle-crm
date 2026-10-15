// Next.js settings. The output is a standalone Node server for a container (spec 12.3), so nothing here is
// specific to one host.
import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { securityHeaderRules } from "./security-headers";

const production = process.env.NODE_ENV === "production";

/** API_ORIGIN as a bare origin ("http://127.0.0.1:4000/" gives "http://127.0.0.1:4000"), or the build fails. */
function checkedOrigin(value: string): string {
  const url = URL.parse(value);
  const isOrigin =
    url !== null && (url.protocol === "http:" || url.protocol === "https:") && url.href === `${url.origin}/`;
  if (!isOrigin) throw new Error(`API_ORIGIN must be an http(s) origin such as http://localhost:3001, not "${value}"`);
  return url.origin;
}

/**
 * Where /api/* goes (spec 3): the browser always calls the api on the address it loaded the app from, so cookies stay
 * first-party and the api needs no CORS. Rewrites are fixed when the app is built, so this is for development and the
 * end-to-end tests. A deployment routes /api/* to the api at its load balancer, before Next.js sees the request, so a
 * production build without API_ORIGIN has no rewrite at all: an /api request that reaches the app is a 404, never one
 * quietly sent to whatever listens on localhost.
 */
const apiOrigin = process.env.API_ORIGIN
  ? checkedOrigin(process.env.API_ORIGIN)
  : production
    ? null
    : "http://localhost:3001";

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
  rewrites: () =>
    Promise.resolve(apiOrigin === null ? [] : [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }]),
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
