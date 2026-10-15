// Next.js settings. The output is a standalone Node server for a container (spec 12.3), so nothing here is
// specific to one host.
import path from "node:path";
import type { NextConfig } from "next";
import { securityHeaders } from "./security-headers";

/**
 * Where /api/* goes (spec 3): the browser always calls the api on the address it loaded the app from, so cookies stay
 * first-party and the api needs no CORS. Rewrites are fixed when the app is built, so this is for development and the
 * end-to-end tests; a deployment routes /api/* to the api at its load balancer, before Next.js sees the request.
 */
const apiOrigin = process.env.API_ORIGIN ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  // `next dev` would write an AGENTS.md here when an AI agent runs it; the repo's guidance is CLAUDE.md.
  agentRules: false,
  // No image optimization endpoint: the app shows no remote images, and the endpoint is work and attack surface.
  images: { unoptimized: true },
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
      { source: "/:path*", headers: securityHeaders({ development: process.env.NODE_ENV === "development" }) },
    ]),
  rewrites: () => Promise.resolve([{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }]),
};

export default nextConfig;
