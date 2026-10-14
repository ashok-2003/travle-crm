// The api's settings, read from environment variables once at start-up and checked, so a bad deploy fails loudly.
import { isIP } from "node:net";
import type { AuthSettings } from "@travel-crm/domain/identity";
import { z } from "zod";

/** The secret in .env.example: fine on a laptop, never in production. */
const EXAMPLE_SECRET = "dev-only-secret-not-for-any-real-deploy";

/** A comma-separated list, e.g. "https://a.example,https://b.example". Empty items are dropped. */
const commaSeparated = z
  .string()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item !== ""),
  );

/** An origin as browsers send it: scheme and host (and port) only, no wildcard, path, query or credentials. */
const origin = z.string().superRefine((value, context) => {
  const trimmed = value.replace(/\/$/, "");
  const parsed = URL.parse(trimmed);
  if (/[*?]/.test(value)) context.addIssue({ code: "custom", message: "must not contain wildcards" });
  else if (parsed === null || !/^https?:$/.test(parsed.protocol) || parsed.origin !== trimmed) {
    context.addIssue({ code: "custom", message: "must be http(s) origins: scheme and host only" });
  }
});

/**
 * An IPv4 or IPv6 address, or a CIDR range such as 10.0.0.0/8. Zone ids (fe80::1%eth0) and IPv4-mapped IPv6 addresses
 * (::ffff:10.0.0.1, in any spelling) are refused: Better Auth's proxy matching ignores them, so such a proxy would
 * silently never count as trusted.
 */
const addressOrRange = z.string().refine((value) => {
  const [address = "", prefix, ...rest] = value.split("/");
  const version = isIP(address);
  if (version === 0 || rest.length > 0 || address.includes("%") || isIpv4Mapped(address)) return false;
  if (prefix === undefined) return true;
  return /^\d{1,3}$/.test(prefix) && Number(prefix) <= (version === 4 ? 32 : 128);
}, "must be IP addresses or CIDR ranges, without zone ids or ::ffff: addresses");

/** The URL parser writes every IPv6 address in its shortest form, so each spelling of ::ffff:a.b.c.d looks alike. */
function isIpv4Mapped(address: string): boolean {
  return isIP(address) === 6 && new URL(`http://[${address}]`).hostname.startsWith("[::ffff:");
}

const developmentLike = (nodeEnv: string): boolean => nodeEnv === "development" || nodeEnv === "test";

// DATABASE_MIGRATOR_URL and DATABASE_PLATFORM_URL are left out on purpose: the api never runs migrations, and it never
// connects as the role that sees every organization.
const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("production"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    /** Postgres, connecting as the app_runtime role. */
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, message: "must be a postgresql:// URL" }),
    DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
    /** Signs and encrypts cookies and two-factor secrets. Generate with `openssl rand -base64 32`. */
    BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
    /** Where browsers reach the api, e.g. https://app.example.in. */
    BETTER_AUTH_URL: z.url({ protocol: /^https?$/, message: "must be an http(s) URL" }),
    /** Other origins allowed to call the api with cookies, comma-separated, e.g. the web app in development. */
    TRUSTED_ORIGINS: commaSeparated.pipe(z.array(origin)),
    /** Sign-in rate limiting. Only development and tests may turn it off. */
    AUTH_RATE_LIMIT: z.stringbool().default(true),
    /** Headers the load balancer puts the client's IP address in, comma-separated. */
    AUTH_IP_ADDRESS_HEADERS: commaSeparated.pipe(z.array(z.string()).min(1)).default(["x-forwarded-for"]),
    /**
     * Proxies in front of the api (IPs or CIDRs). Without them x-forwarded-for is trusted only when it holds one
     * address, so the load balancer must overwrite it; with them, the client is the first address not in this list.
     */
    AUTH_TRUSTED_PROXIES: commaSeparated.pipe(z.array(addressOrRange)),
  })
  .superRefine((environment, context) => {
    if (developmentLike(environment.NODE_ENV)) return;
    const problem = (path: string, message: string) => {
      context.addIssue({ code: "custom", path: [path], message });
    };
    if (!environment.BETTER_AUTH_URL.startsWith("https://")) problem("BETTER_AUTH_URL", "must be https in production");
    if (!environment.AUTH_RATE_LIMIT) problem("AUTH_RATE_LIMIT", "cannot be off in production");
    if (environment.TRUSTED_ORIGINS.some((item) => !item.startsWith("https://"))) {
      problem("TRUSTED_ORIGINS", "must be https origins in production");
    }
    const secret = environment.BETTER_AUTH_SECRET.trim();
    if (secret === EXAMPLE_SECRET || secret.length < 32 || new Set(secret).size < 10) {
      problem("BETTER_AUTH_SECRET", "is too weak for production: use `openssl rand -base64 32`");
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

/** Lists every problem by variable name. Values are never included: some are secrets. */
export class EnvironmentError extends Error {
  constructor(problems: string[]) {
    super(`The api's environment is not valid:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
    this.name = "EnvironmentError";
  }
}

export function loadEnvironment(source: Record<string, string | undefined>): Environment {
  const result = environmentSchema.safeParse(source);
  if (!result.success) {
    throw new EnvironmentError(result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
  }
  return result.data;
}

export function authSettingsFrom(environment: Environment): AuthSettings {
  return {
    // The product's name moves to the brand package (spec section 10) when that package exists.
    appName: "Travel CRM",
    secret: environment.BETTER_AUTH_SECRET,
    baseUrl: environment.BETTER_AUTH_URL,
    trustedOrigins: environment.TRUSTED_ORIGINS.map((origin) => new URL(origin).origin),
    secureCookies: environment.NODE_ENV === "production" || environment.BETTER_AUTH_URL.startsWith("https://"),
    rateLimit: environment.AUTH_RATE_LIMIT,
    ipAddressHeaders: environment.AUTH_IP_ADDRESS_HEADERS.map((header) => header.toLowerCase()),
    trustedProxies: environment.AUTH_TRUSTED_PROXIES,
  };
}
