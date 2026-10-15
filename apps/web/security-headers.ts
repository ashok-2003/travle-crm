// The headers every response carries (spec 12.4: strict security headers). Kept apart from next.config.ts so a test
// can read them.

/**
 * The Content-Security-Policy. Scripts and styles allow 'unsafe-inline' because Next.js inlines its boot scripts and
 * the component library sets inline styles; nonces would make every page render per request, and pages must stay
 * static so the service worker can keep them for offline use. Everything else is our own origin only. The accepted
 * risk is recorded in ADR 0018; test/no-inner-html.test.ts keeps its premise, that the app renders no HTML of its own.
 */
export function contentSecurityPolicy({ development }: { development: boolean }): string {
  return [
    "default-src 'self'",
    // React's development build evaluates code for its error overlays.
    `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // A deployment is https only. Development may run over plain http on the local network, to try it on a phone;
    // browsers leave localhost and 127.0.0.1 (the journeys) alone.
    ...(development ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function securityHeaders({ development }: { development: boolean }): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy({ development }) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
    // Browsers ignore it over plain http (local development); deployments are https only.
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  ];
}

/**
 * Pages whose address can hold a secret (the emailed reset token) or that sit in the middle of signing in. Their
 * requests carry only the origin as Referer, never the path or query, not even to our own origin, where the /api
 * rewrite would pass the full address on to the api's and the load balancer's logs (ADR 0006).
 *
 * Not "no-referrer": under it the Fetch standard ("append a request Origin header") sends `Origin: null` on a
 * same-origin POST, and both the api's trusted-JSON check and Better Auth's origin check refuse that. "strict-origin"
 * leaves Origin as it is.
 */
export const TOKEN_PAGES = ["/reset-password", "/sign-in/two-factor", "/two-factor-setup"] as const;

/**
 * The header rules for next.config.ts. Next.js applies every matching rule in order and a later value wins
 * (next/dist/server/lib/router-utils/resolve-routes.js), so the pages' own Referrer-Policy comes after the catch-all.
 */
export function securityHeaderRules({ development }: { development: boolean }) {
  return [
    { source: "/:path*", headers: securityHeaders({ development }) },
    ...TOKEN_PAGES.map((source) => ({ source, headers: [{ key: "Referrer-Policy", value: "strict-origin" }] })),
  ];
}
