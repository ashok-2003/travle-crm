// The console process's own settings (ADR 0019), beside the api's environment it starts with: the platform role's
// connection, which only this process is given, its port, and the shared demo the nightly job resets. Checked at
// start-up, like the api's.
import { organizationCode } from "@travel-crm/contracts/identity";
import type { DemoSettings } from "@travel-crm/domain/platform";
import { z } from "zod";
import { EnvironmentError, type Environment } from "./environment.js";

const consoleSchema = z.object({
  /** Postgres as app_platform, the role that sees every organization. Only the console process is given it. */
  DATABASE_PLATFORM_URL: z.url({ protocol: /^postgres(ql)?$/, message: "must be a postgresql:// URL" }),
  CONSOLE_PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  /** The shared demo (spec 7.4), both or neither: its organization code and its password. It is on its own plan. */
  DEMO_ORGANIZATION_CODE: organizationCode.optional(),
  /** Every demo account's password. Sales staff share it, so it is never a real person's. */
  DEMO_PASSWORD: z.string().min(8, "must be at least 8 characters").optional(),
});

export interface ConsoleSettings {
  platformDatabaseUrl: string;
  port: number;
  /** Null when no demo is set: the nightly reset doesn't run. */
  demo: DemoSettings | null;
}

const DEMO_VARIABLES = ["DEMO_ORGANIZATION_CODE", "DEMO_PASSWORD"] as const;

/**
 * The console's variables, given the api's environment the process already read. Lists every problem by variable
 * name, never by value, as loadEnvironment does.
 */
export function loadConsoleSettings(
  source: Record<string, string | undefined>,
  environment: Pick<Environment, "DATABASE_URL">,
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
  };
}
