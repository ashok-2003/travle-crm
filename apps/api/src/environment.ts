// The api's settings, read from environment variables once at start-up and checked, so a bad deploy fails loudly.
import { isIP } from "node:net";
import { brand } from "@travel-crm/brand";
import type { AuthSettings } from "@travel-crm/domain/identity";
import { LOG_LEVELS } from "@travel-crm/integrations/logging";
import { z } from "zod";
import { serviceVariables } from "./service-variables.js";
import { sheetsHashKeyIsWeak } from "./sheets-settings.js";

/** The secret in .env.example: fine on a laptop, never in production. */
const EXAMPLE_SECRET = "dev-only-secret-not-for-any-real-deploy";

/**
 * .env.example's VAPID public key, whose private key everyone can read. Refusing it refuses the pair: the push sender
 * refuses a private key that isn't the public key's (integrations' web-push-sender.ts).
 */
const EXAMPLE_VAPID_PUBLIC_KEY =
  "BNDwagd-1gwbRjL1o3iP9g4zUvYkczzP1yE9xNbcidEzKkDbvrHaBCyHQi8btoNnI9IMV7CoQun_1oMlSCz5lTY";

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
    /** The least important line a process writes (ADR 0032): `info` in production, `debug` in development and tests. */
    LOG_LEVEL: z.preprocess((value) => (value === "" ? undefined : value), z.enum(LOG_LEVELS).optional()),
    /** Postgres, connecting as the app_runtime role. */
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, message: "must be a postgresql:// URL" }),
    DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
    /**
     * Each database transaction's longest wait for a connection and longest run, in milliseconds, where the code names
     * none: Prisma's own 2 s and 5 s by default. A slow host needs more (a tenth of a CPU, docs/serverless.md).
     */
    DATABASE_TRANSACTION_MAX_WAIT_MS: z.coerce.number().int().min(1).default(2000),
    DATABASE_TRANSACTION_TIMEOUT_MS: z.coerce.number().int().min(1).default(5000),
    /** Signs and encrypts cookies and two-factor secrets. Generate with `openssl rand -base64 32`. */
    BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
    /** Where browsers reach the api, e.g. https://app.example.in. */
    BETTER_AUTH_URL: z.url({ protocol: /^https?$/, message: "must be an http(s) URL" }),
    /** Other origins allowed to call the api with cookies, comma-separated, e.g. the web app in development. */
    TRUSTED_ORIGINS: commaSeparated.pipe(z.array(origin)),
    /** Sign-in rate limiting. Only development and tests may turn it off. */
    AUTH_RATE_LIMIT: z.stringbool().default(true),
    /** Headers the load balancer puts the client's IP address in, comma-separated. Public routes' limits use it too. */
    AUTH_IP_ADDRESS_HEADERS: commaSeparated.pipe(z.array(z.string()).min(1)).default(["x-forwarded-for"]),
    /**
     * Proxies in front of the api (IPs or CIDRs). Without them x-forwarded-for is trusted only when it holds one
     * address, so the load balancer must overwrite it; with them, the client is the first address not in this list.
     */
    AUTH_TRUSTED_PROXIES: commaSeparated.pipe(z.array(addressOrRange)),
    ...serviceVariables,
  })
  .superRefine((environment, context) => {
    const problem = (path: string, message: string) => {
      context.addIssue({ code: "custom", path: [path], message });
    };
    // A user without a password (or the other way round) is a half-made setting, in every environment.
    if (environment.SMTP_USER !== undefined && environment.SMTP_PASSWORD === undefined) {
      problem("SMTP_PASSWORD", "is needed with SMTP_USER");
    }
    if (environment.SMTP_PASSWORD !== undefined && environment.SMTP_USER === undefined) {
      problem("SMTP_USER", "is needed with SMTP_PASSWORD");
    }
    // Signing the claim and the tombstones needs the key wherever the sheets are read (spec 14).
    if (environment.GOOGLE_SHEETS_SERVICE_ACCOUNTS !== undefined && environment.SHEETS_HASH_KEY === undefined) {
      problem("SHEETS_HASH_KEY", "is needed (at least 32 characters) with GOOGLE_SHEETS_SERVICE_ACCOUNTS");
    }
    if (developmentLike(environment.NODE_ENV)) return;
    if (environment.GOOGLE_SHEETS_TEST_SERVER_URL !== undefined) {
      problem("GOOGLE_SHEETS_TEST_SERVER_URL", "is for development and tests only: unset it in production");
    }
    if (environment.SHEETS_CHECK_INTERVAL_SECONDS !== undefined) {
      problem("SHEETS_CHECK_INTERVAL_SECONDS", "is for development and tests only: unset it in production");
    }
    if (!environment.BETTER_AUTH_URL.startsWith("https://")) problem("BETTER_AUTH_URL", "must be https in production");
    if (!environment.APP_URL.startsWith("https://")) problem("APP_URL", "must be https in production");
    if (!environment.AUTH_RATE_LIMIT) problem("AUTH_RATE_LIMIT", "cannot be off in production");
    if (environment.TRUSTED_ORIGINS.some((item) => !item.startsWith("https://"))) {
      problem("TRUSTED_ORIGINS", "must be https origins in production");
    }
    const secret = environment.BETTER_AUTH_SECRET.trim();
    if (secret === EXAMPLE_SECRET || secret.length < 32 || new Set(secret).size < 10) {
      problem("BETTER_AUTH_SECRET", "is too weak for production: use `openssl rand -base64 32`");
    }
    if (environment.SHEETS_HASH_KEY !== undefined && sheetsHashKeyIsWeak(environment.SHEETS_HASH_KEY)) {
      problem("SHEETS_HASH_KEY", "is too weak for production: use `openssl rand -base64 32`");
    }
    if (environment.VAPID_PUBLIC_KEY.trim() === EXAMPLE_VAPID_PUBLIC_KEY) {
      problem(
        "VAPID_PUBLIC_KEY",
        "is .env.example's, whose private key is public: generate a pair for this environment and keep it",
      );
    }
  });

export type Environment = z.infer<typeof environmentSchema> & { LOG_LEVEL: (typeof LOG_LEVELS)[number] };

/** Lists every problem by variable name. Values are never included: some are secrets. */
export class EnvironmentError extends Error {
  constructor(problems: string[]) {
    super(`The environment is not valid:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
    this.name = "EnvironmentError";
  }
}

export function loadEnvironment(source: Record<string, string | undefined>): Environment {
  const result = environmentSchema.safeParse(source);
  if (!result.success) {
    throw new EnvironmentError(result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
  }
  const { data } = result;
  return { ...data, LOG_LEVEL: data.LOG_LEVEL ?? (developmentLike(data.NODE_ENV) ? "debug" : "info") };
}

export function authSettingsFrom(environment: Environment): AuthSettings {
  return {
    // Authenticator apps show the product's name next to the code.
    appName: brand.productName,
    secret: environment.BETTER_AUTH_SECRET,
    baseUrl: environment.BETTER_AUTH_URL,
    // The web app may call the api with cookies, and a password reset may send people back to it.
    trustedOrigins: [
      ...new Set([...environment.TRUSTED_ORIGINS, environment.APP_URL].map((url) => new URL(url).origin)),
    ],
    secureCookies: environment.NODE_ENV === "production" || environment.BETTER_AUTH_URL.startsWith("https://"),
    rateLimit: environment.AUTH_RATE_LIMIT,
    ipAddressHeaders: environment.AUTH_IP_ADDRESS_HEADERS.map((header) => header.toLowerCase()),
    trustedProxies: environment.AUTH_TRUSTED_PROXIES,
  };
}
