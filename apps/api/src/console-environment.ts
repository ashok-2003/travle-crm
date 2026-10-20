// The console process's own settings (ADR 0019), beside the api's environment it starts with: the platform role's
// connection, which only this process is given, its port, and the shared demo the nightly job resets. Checked at
// start-up, like the api's.
import { organizationCode } from "@travel-crm/contracts/identity";
import type { DemoSettings } from "@travel-crm/domain/platform";
import { z } from "zod";
import { EnvironmentError, type Environment } from "./environment.js";
import { sheetsHashKeyIsWeak } from "./sheets-settings.js";

const consoleSchema = z.object({
  /** Postgres as app_platform, the role that sees every organization. Only the console process is given it. */
  DATABASE_PLATFORM_URL: z.url({ protocol: /^postgres(ql)?$/, message: "must be a postgresql:// URL" }),
  CONSOLE_PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  /** The shared demo (spec 7.4), both or neither: its organization code and its password. It is on its own plan. */
  DEMO_ORGANIZATION_CODE: organizationCode.optional(),
  /** Every demo account's password. Sales staff share it, so it is never a real person's. */
  DEMO_PASSWORD: z.string().min(8, "must be at least 8 characters").optional(),
  /**
   * Keys the erasure's tombstones of a customer's sheet rows (S43, S6): the console's erasure job writes them. The same
   * value as the api's and the worker's, at least 32 characters. The console never takes the service accounts.
   */
  SHEETS_HASH_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(32, "must be at least 32 characters").optional(),
  ),
});

export interface ConsoleSettings {
  platformDatabaseUrl: string;
  port: number;
  /** Null when no demo is set: the nightly reset doesn't run. */
  demo: DemoSettings | null;
  /** SHEETS_HASH_KEY, or null when no sheets are set up. Only the erasure of a customer who has sheet rows needs it. */
  sheetsHashKey: string | null;
}

const DEMO_VARIABLES = ["DEMO_ORGANIZATION_CODE", "DEMO_PASSWORD"] as const;

/**
 * The console's variables, given the api's environment the process already read. Lists every problem by variable
 * name, never by value, as loadEnvironment does.
 */
export function loadConsoleSettings(
  source: Record<string, string | undefined>,
  environment: Pick<Environment, "DATABASE_URL" | "NODE_ENV">,
): ConsoleSettings {
  const result = consoleSchema.safeParse(source);
  if (!result.success) {
    throw new EnvironmentError(result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
  }
  const settings = result.data;
  const problems: string[] = [];
  if (settings.DATABASE_PLATFORM_URL === environment.DATABASE_URL) {
    problems.push("DATABASE_PLATFORM_URL: must connect as the platform role, not DATABASE_URL's");
  }
  const productionLike = environment.NODE_ENV !== "development" && environment.NODE_ENV !== "test";
  if (productionLike && settings.SHEETS_HASH_KEY !== undefined && sheetsHashKeyIsWeak(settings.SHEETS_HASH_KEY)) {
    problems.push("SHEETS_HASH_KEY: is too weak for production: use `openssl rand -base64 32`");
  }
  const demoSet = DEMO_VARIABLES.filter((name) => settings[name] !== undefined);
  if (demoSet.length > 0) {
    for (const name of DEMO_VARIABLES) {
      if (settings[name] === undefined) problems.push(`${name}: is needed with ${demoSet.join(", ")}`);
    }
  }
  if (problems.length > 0) throw new EnvironmentError(problems);
  const { DEMO_ORGANIZATION_CODE: code, DEMO_PASSWORD: password } = settings;
  return {
    platformDatabaseUrl: settings.DATABASE_PLATFORM_URL,
    port: settings.CONSOLE_PORT,
    demo: code === undefined || password === undefined ? null : { code, password },
    sheetsHashKey: settings.SHEETS_HASH_KEY ?? null,
  };
}

/**
 * SC5: the console never holds the Google service accounts. Called first thing by the console's processes, it takes the
 * variable out of what they will read, so a compose file or a host that hands it to every container still doesn't give
 * it to this one. Returns the same object.
 */
export function forgetServiceAccounts<T extends Record<string, string | undefined>>(
  variables: T = process.env as T,
): T {
  delete variables.GOOGLE_SHEETS_SERVICE_ACCOUNTS;
  return variables;
}
