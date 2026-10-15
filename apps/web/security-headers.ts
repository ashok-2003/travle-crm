// The headers every response carries (spec 12.4: strict security headers). Kept apart from next.config.ts so a test
// can read them.

/**
 * The Content-Security-Policy. Scripts and styles allow 'unsafe-inline' because Next.js inlines its boot scripts and
 * the component library sets inline styles; nonces would make every page render per request, and pages must stay
 * static so the service worker can keep them for offline use. Everything else is our own origin only.
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
