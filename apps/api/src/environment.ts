// The api's settings, read from environment variables once at start-up and checked, so a bad deploy fails loudly.
import type { AuthSettings } from "@travel-crm/domain/identity";
import { z } from "zod";

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

// DATABASE_MIGRATOR_URL and DATABASE_PLATFORM_URL are left out on purpose: the api never runs migrations, and it never
// connects as the role that sees every organization.
const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    /** Postgres, connecting as the app_runtime role. */
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, message: "must be a postgresql:// URL" }),
    DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
    /** Signs and encrypts cookies and two-factor secrets. Generate with `openssl rand -base64 32`. */
    BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
    /** Where browsers reach the api, e.g. https://app.example.in. */
    BETTER_AUTH_URL: z.url({ protocol: /^https?$/, message: "must be an http(s) URL" }),
    /** Other origins allowed to call the api with cookies, comma-separated, e.g. the web app in development. */
    TRUSTED_ORIGINS: commaSeparated.pipe(z.array(z.url({ protocol: /^https?$/, message: "must be http(s) origins" }))),
    /** Sign-in rate limiting. Only tests turn it off. */
    AUTH_RATE_LIMIT: z.stringbool().default(true),
    /** Headers the load balancer puts the client's IP address in, comma-separated. */
    AUTH_IP_ADDRESS_HEADERS: commaSeparated.pipe(z.array(z.string()).min(1)).default(["x-forwarded-for"]),
  })
  .refine(
    (environment) => environment.NODE_ENV !== "production" || environment.BETTER_AUTH_URL.startsWith("https://"),
    {
      path: ["BETTER_AUTH_URL"],
      message: "must be https in production",
    },
  )
  .refine((environment) => environment.NODE_ENV !== "production" || environment.AUTH_RATE_LIMIT, {
    path: ["AUTH_RATE_LIMIT"],
    message: "cannot be off in production",
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
  };
}
