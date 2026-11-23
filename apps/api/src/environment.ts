// The api's settings, read from environment variables once at start-up and checked, so a bad deploy fails loudly.
import { isIP } from "node:net";
import { brand } from "@travel-crm/brand";
import type { AuthSettings } from "@travel-crm/domain/identity";
import { LOG_LEVELS } from "@travel-crm/integrations/logging";
import { z } from "zod";
import { langfuseProblems } from "./langfuse-settings.js";
import { META_VARIABLES, metaVerifyTokenIsWeak } from "./meta-variables.js";
import { serviceVariables } from "./service-variables.js";
import { sheetsHashKeyIsWeak } from "./sheets-settings.js";
import { WHATSAPP_VARIABLES, whatsappSecretIsWeak } from "./whatsapp-variables.js";

/** The secret in .env.example: fine on a laptop, never in production. */
const EXAMPLE_SECRET = "dev-only-secret-not-for-any-real-deploy";

/**
 * .env.example's VAPID public key, whose private key everyone can read. Refusing it refuses the pair: the push sender
 * refuses a private key that isn't the public key's (integrations' web-push-sender.ts).
 */
const EXAMPLE_VAPID_PUBLIC_KEY =
  "BNDwagd-1gwbRjL1o3iP9g4zUvYkczzP1yE9xNbcidEzKkDbvrHaBCyHQi8btoNnI9IMV7CoQun_1oMlSCz5lTY";

/** A setting passed through from a compose file or a .env left blank is the same as unset. */
function emptyAsUnset<Schema extends z.ZodType>(schema: Schema) {
  return z.preprocess((value) => (value === "" ? undefined : value), schema);
}

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

/**
 * Each other provider's address, key and models: the primary model asked before every key (the owner, 2026-11-24), the
 * fallbacks after them (2026-11-23), the first before the second. Each needs AI_API_KEY or the service account behind it:
 * voice notes and Fill it for me go to Gemini.
 */
const providerSettings = [
  ["AI_PRIMARY_BASE_URL", "AI_PRIMARY_API_KEY", "AI_PRIMARY_MODELS"],
  ["AI_FALLBACK_BASE_URL", "AI_FALLBACK_API_KEY", "AI_FALLBACK_MODELS"],
  ["AI_FALLBACK_2_BASE_URL", "AI_FALLBACK_2_API_KEY", "AI_FALLBACK_2_MODELS"],
] as const;

// DATABASE_MIGRATOR_URL and DATABASE_PLATFORM_URL are left out on purpose: the api never runs migrations, and it never
// connects as the role that sees every organization.
const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("production"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    /** The least important line a process writes (ADR 0032): `info` in production, `debug` in development and tests. */
    LOG_LEVEL: emptyAsUnset(z.enum(LOG_LEVELS).optional()),
    /** Ships every log line to this Axiom dataset too (ADR 0032), with AXIOM_DATASET; both or neither. A secret. */
    AXIOM_TOKEN: emptyAsUnset(z.string().min(1).optional()),
    AXIOM_DATASET: emptyAsUnset(z.string().min(1).optional()),
    /** Axiom's API address: the EU region's is https://api.eu.axiom.co. */
    AXIOM_URL: emptyAsUnset(z.url({ protocol: /^https?$/, message: "must be an http(s) URL" }).optional()).transform(
      (url) => url?.replace(/\/+$/, "") ?? "https://api.axiom.co",
    ),
    /** Postgres, connecting as the app_runtime role. */
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, message: "must be a postgresql:// URL" }),
    DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
    /**
     * Each database transaction's longest wait for a connection and longest run, in milliseconds, where the code names
     * none: Prisma's own 2 s and 5 s by default. A slow host needs more (a tenth of a CPU, docs/serverless.md).
     */
    DATABASE_TRANSACTION_MAX_WAIT_MS: z.coerce.number().int().min(1).default(2000),
    DATABASE_TRANSACTION_TIMEOUT_MS: z.coerce.number().int().min(1).default(5000),
    /**
     * How often, in seconds, the worker looks for work: each queue's jobs, the outbox's events and pg-boss's scheduled
     * sends (at most every 45 s). Unset, pg-boss's 2 s and the relay's 1 s. A metered network sets more (docs/serverless.md).
     */
    JOBS_POLLING_SECONDS: emptyAsUnset(z.coerce.number().int().min(1).max(600).optional()),
    /**
     * The api's alone: a file the host watches, where the api writes the time when work for the worker came in, so a
     * worker the night's plan stopped starts (apps/api/src/work-signal.ts; docs/runbook.md, "Waking the worker at
     * night"). Unset, nothing is written.
     */
    WORK_SIGNAL_FILE: emptyAsUnset(z.string().min(1).optional()),
    /**
     * Whether the console runs its jobs (on by default). Off, it serves its pages with a pg-boss that only sends, so an
     * idle console queries nothing: the two small servers' nights (docs/runbook.md, "Working hours and night bursts").
     * The console's alone; here because its services are built from this environment.
     */
    CONSOLE_JOBS: emptyAsUnset(z.stringbool().default(true)),
    /** Signs and encrypts cookies and two-factor secrets. Generate with `openssl rand -base64 32`. */
    BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
    /** Where browsers reach the api, e.g. https://app.example.in. */
    BETTER_AUTH_URL: z.url({ protocol: /^https?$/, message: "must be an http(s) URL" }),
    /** Other origins allowed to call the api with cookies, comma-separated, e.g. the web app in development. */
    TRUSTED_ORIGINS: commaSeparated.pipe(z.array(origin)),
    /** Sign-in rate limiting. Only development and tests may turn it off. */
    AUTH_RATE_LIMIT: z.stringbool().default(true),
    /**
     * The api keeps members' access and subscriptions in memory for five minutes (packages/api/src/access-cache.ts).
     * Off, every request reads them: the journeys change subscriptions straight in the database and expect it at once.
     */
    ACCESS_CACHE: z.stringbool().default(true),
    /** Headers the load balancer puts the client's IP address in, comma-separated. Public routes' limits use it too. */
    AUTH_IP_ADDRESS_HEADERS: commaSeparated.pipe(z.array(z.string()).min(1)).default(["x-forwarded-for"]),
    /**
     * Proxies in front of the api (IPs or CIDRs). Without them x-forwarded-for is trusted only when it holds one
     * address, so the load balancer must overwrite it; with them, the client is the first address not in this list.
     */
    AUTH_TRUSTED_PROXIES: commaSeparated.pipe(z.array(addressOrRange)),
    /**
     * How many entries our own proxies append to the address header, for the website form's limits only (W32): the
     * visitor is the entry that many places from the right. Unset, the forms read the address as sign-in does.
     */
    PUBLIC_FORM_PROXY_HOPS: emptyAsUnset(z.coerce.number().int().min(1).max(5).optional()),
    /** Cloudflare Turnstile for the website form (W39): both keys or neither. The secret is never logged or shown. */
    TURNSTILE_SITE_KEY: emptyAsUnset(z.string().min(1).optional()),
    TURNSTILE_SECRET_KEY: emptyAsUnset(z.string().min(1).optional()),
    /** The journeys' fake siteverify (development and tests only; refused in production). */
    TURNSTILE_VERIFY_URL: emptyAsUnset(z.url({ protocol: /^https?$/, message: "must be an http(s) URL" }).optional()),
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
    if (environment.AXIOM_TOKEN !== undefined && environment.AXIOM_DATASET === undefined) {
      problem("AXIOM_DATASET", "is needed with AXIOM_TOKEN");
    }
    if (environment.AXIOM_DATASET !== undefined && environment.AXIOM_TOKEN === undefined) {
      problem("AXIOM_TOKEN", "is needed with AXIOM_DATASET");
    }
    if (environment.TURNSTILE_SITE_KEY !== undefined && environment.TURNSTILE_SECRET_KEY === undefined) {
      problem("TURNSTILE_SECRET_KEY", "is needed with TURNSTILE_SITE_KEY");
    }
    if (environment.TURNSTILE_SECRET_KEY !== undefined && environment.TURNSTILE_SITE_KEY === undefined) {
      problem("TURNSTILE_SITE_KEY", "is needed with TURNSTILE_SECRET_KEY");
    }
    if (environment.TURNSTILE_VERIFY_URL !== undefined && environment.TURNSTILE_SECRET_KEY === undefined) {
      problem("TURNSTILE_VERIFY_URL", "is only for use with both Turnstile keys");
    }
    // Signing the claim and the tombstones needs the key wherever the sheets are read (spec 14).
    if (environment.GOOGLE_SHEETS_SERVICE_ACCOUNTS !== undefined && environment.SHEETS_HASH_KEY === undefined) {
      problem("SHEETS_HASH_KEY", "is needed (at least 32 characters) with GOOGLE_SHEETS_SERVICE_ACCOUNTS");
    }
    // Meta's five settings come together: one alone, or a group missing one, is a half-made setting (spec 13).
    const metaSet = META_VARIABLES.filter((name) => environment[name] !== undefined);
    if (metaSet.length > 0 && metaSet.length < META_VARIABLES.length) {
      for (const name of META_VARIABLES.filter((candidate) => environment[candidate] === undefined)) {
        problem(name, "is needed with the other Meta settings: all five or none");
      }
    }
    if (environment.META_GRAPH_TEST_SERVER_URL !== undefined && metaSet.length === 0) {
      problem("META_GRAPH_TEST_SERVER_URL", "is only for use with the Meta settings");
    }
    // WhatsApp's three settings come together too (spec 13).
    const whatsappSet = WHATSAPP_VARIABLES.filter((name) => environment[name] !== undefined);
    if (whatsappSet.length > 0 && whatsappSet.length < WHATSAPP_VARIABLES.length) {
      for (const name of WHATSAPP_VARIABLES.filter((candidate) => environment[candidate] === undefined)) {
        problem(name, "is needed with the other WhatsApp settings: all three or none");
      }
    }
    if (environment.MSG91_TEST_SERVER_URL !== undefined && whatsappSet.length === 0) {
      problem("MSG91_TEST_SERVER_URL", "is only for use with the WhatsApp settings");
    }
    // Brevo's webhook needs its path token and its bearer key together.
    if (environment.BREVO_WEBHOOK_TOKEN !== undefined && environment.BREVO_WEBHOOK_KEY === undefined) {
      problem("BREVO_WEBHOOK_KEY", "is needed with BREVO_WEBHOOK_TOKEN");
    }
    if (environment.BREVO_WEBHOOK_KEY !== undefined && environment.BREVO_WEBHOOK_TOKEN === undefined) {
      problem("BREVO_WEBHOOK_TOKEN", "is needed with BREVO_WEBHOOK_KEY");
    }
    // The AI's endpoint, credential and models come together: a key (or Vertex AI's service account, one or the other)
    // needs its chat models, the service account its endpoint, and the others need one of them.
    const credential = environment.AI_API_KEY !== undefined || environment.AI_VERTEX_SERVICE_ACCOUNT !== undefined;
    if (environment.AI_API_KEY !== undefined && environment.AI_VERTEX_SERVICE_ACCOUNT !== undefined) {
      problem("AI_VERTEX_SERVICE_ACCOUNT", "is instead of AI_API_KEY: set one of them");
    }
    if (credential && environment.AI_CHAT_MODELS === undefined) {
      problem("AI_CHAT_MODELS", "is needed with AI_API_KEY or AI_VERTEX_SERVICE_ACCOUNT");
    }
    if (environment.AI_VERTEX_SERVICE_ACCOUNT !== undefined && environment.AI_BASE_URL === undefined) {
      problem("AI_BASE_URL", "is needed with AI_VERTEX_SERVICE_ACCOUNT: the Vertex endpoint's address");
    }
    for (const name of ["AI_BASE_URL", "AI_CHAT_MODELS", "AI_FAST_MODELS"] as const) {
      if (environment[name] !== undefined && !credential) {
        problem(name, "is only for use with AI_API_KEY or AI_VERTEX_SERVICE_ACCOUNT");
      }
    }
    // The backup stands behind that AI, and its own settings need its key.
    if (environment.AI_BACKUP_API_KEY !== undefined && !credential) {
      problem("AI_BACKUP_API_KEY", "is only for use with AI_API_KEY or AI_VERTEX_SERVICE_ACCOUNT");
    }
    for (const name of [
      "AI_BACKUP_BASE_URL",
      "AI_BACKUP_CHAT_MODELS",
      "AI_BACKUP_FAST_MODELS",
      "AI_BACKUP_API_KEY_2",
    ] as const) {
      if (environment[name] !== undefined && environment.AI_BACKUP_API_KEY === undefined) {
        problem(name, "is only for use with AI_BACKUP_API_KEY");
      }
    }
    // Behind Vertex AI, a backup key is another endpoint's (AI Studio's): without its own address it would go to Vertex.
    if (
      environment.AI_VERTEX_SERVICE_ACCOUNT !== undefined &&
      environment.AI_BACKUP_API_KEY !== undefined &&
      environment.AI_BACKUP_BASE_URL === undefined
    ) {
      problem(
        "AI_BACKUP_BASE_URL",
        "is needed with AI_BACKUP_API_KEY and AI_VERTEX_SERVICE_ACCOUNT: a key can't call Vertex",
      );
    }
    // Another endpoint names its models its own way: the first's names would only answer 404 there.
    if (
      environment.AI_BACKUP_BASE_URL !== undefined &&
      environment.AI_BACKUP_BASE_URL !== environment.AI_BASE_URL &&
      environment.AI_BACKUP_CHAT_MODELS === undefined
    ) {
      problem("AI_BACKUP_CHAT_MODELS", "is needed when AI_BACKUP_BASE_URL is another endpoint than AI_BASE_URL");
    }
    // Each other provider: its address, key and models together, with the AI above.
    for (const [base, key, models] of providerSettings) {
      if (environment[key] !== undefined && !credential) {
        problem(key, "is only for use with AI_API_KEY or AI_VERTEX_SERVICE_ACCOUNT");
      }
      for (const name of [base, models]) {
        if (environment[key] !== undefined && environment[name] === undefined) problem(name, `is needed with ${key}`);
        if (environment[key] === undefined && environment[name] !== undefined)
          problem(name, `is only for use with ${key}`);
      }
    }
    if (environment.AI_TEST_SERVER_URL !== undefined && environment.OPENROUTER_API_KEY === undefined) {
      problem("AI_TEST_SERVER_URL", "is only for use with OPENROUTER_API_KEY");
    }
    for (const { name, message } of langfuseProblems(environment, !developmentLike(environment.NODE_ENV))) {
      problem(name, message);
    }
    if (developmentLike(environment.NODE_ENV)) return;
    // The AI key and the customers' words go in every request: over https only.
    if (environment.AI_BASE_URL !== undefined && !environment.AI_BASE_URL.startsWith("https://")) {
      problem("AI_BASE_URL", "must be an https address in production");
    }
    if (environment.AI_BACKUP_BASE_URL !== undefined && !environment.AI_BACKUP_BASE_URL.startsWith("https://")) {
      problem("AI_BACKUP_BASE_URL", "must be an https address in production");
    }
    for (const [base] of providerSettings) {
      if (environment[base]?.startsWith("https://") === false) problem(base, "must be an https address in production");
    }
    if (environment.AI_TEST_SERVER_URL !== undefined) {
      problem("AI_TEST_SERVER_URL", "is for development and tests only: unset it in production");
    }
    if (environment.MSG91_TEST_SERVER_URL !== undefined) {
      problem("MSG91_TEST_SERVER_URL", "is for development and tests only: unset it in production");
    }
    for (const name of [
      "MSG91_WEBHOOK_TOKEN",
      "MSG91_WEBHOOK_KEY",
      "BREVO_WEBHOOK_TOKEN",
      "BREVO_WEBHOOK_KEY",
    ] as const) {
      const value = environment[name];
      if (value !== undefined && whatsappSecretIsWeak(value)) {
        problem(name, "is too weak for production: use `openssl rand -hex 32`");
      }
    }
    if (environment.META_GRAPH_TEST_SERVER_URL !== undefined) {
      problem("META_GRAPH_TEST_SERVER_URL", "is for development and tests only: unset it in production");
    }
    if (
      environment.META_WEBHOOK_VERIFY_TOKEN !== undefined &&
      metaVerifyTokenIsWeak(environment.META_WEBHOOK_VERIFY_TOKEN)
    ) {
      problem("META_WEBHOOK_VERIFY_TOKEN", "is too weak for production: use `openssl rand -base64 32`");
    }
    if (environment.GOOGLE_SHEETS_TEST_SERVER_URL !== undefined) {
      problem("GOOGLE_SHEETS_TEST_SERVER_URL", "is for development and tests only: unset it in production");
    }
    if (environment.TURNSTILE_VERIFY_URL !== undefined) {
      problem("TURNSTILE_VERIFY_URL", "is for development and tests only: unset it in production");
    }
    if (environment.SHEETS_CHECK_INTERVAL_SECONDS !== undefined) {
      problem("SHEETS_CHECK_INTERVAL_SECONDS", "is for development and tests only: unset it in production");
    }
    if (!environment.AXIOM_URL.startsWith("https://")) problem("AXIOM_URL", "must be https in production");
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

/**
 * LangChain's own variables: some send every chat to LangSmith or print it to the logs, and a later version may add more.
 * The tool agent removes the five it knows before each run; refusing the whole family here means a server never starts
 * with one, whatever LangChain reads next.
 */
const langChainProblems = (source: Record<string, string | undefined>): string[] =>
  Object.entries(source)
    .filter(([name, value]) => /^(LANGSMITH|LANGCHAIN)_/.test(name) && value !== undefined && value !== "")
    .map(([name]) => `${name}: must be unset: LangChain would send the chats to LangSmith or print them`);

/** google-auth-library's debug logging prints its token exchanges (a service account's access token included). */
const googleLoggingProblems = (source: Record<string, string | undefined>): string[] =>
  (source.GOOGLE_SDK_NODE_LOGGING ?? "") === ""
    ? []
    : ["GOOGLE_SDK_NODE_LOGGING: must be unset: Google's library would print its access tokens"];

export function loadEnvironment(source: Record<string, string | undefined>): Environment {
  const result = environmentSchema.safeParse(source);
  const problems = [
    ...(result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)),
    ...langChainProblems(source),
    ...googleLoggingProblems(source),
  ];
  if (!result.success || problems.length > 0) throw new EnvironmentError(problems);
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
