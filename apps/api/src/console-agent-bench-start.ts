// The agent bench's own, lean start: it reads only the two database addresses and the AI settings, and builds only what
// the bench uses (the database, in-memory storage, queue and jobs, the AI model). No object-storage bucket check, mail,
// push or auth settings, no pg-boss: a checkout with a model key and Docker is enough. The local-database check comes
// first, before anything connects.
import { randomBytes } from "node:crypto";
import { createDatabase } from "@travel-crm/db";
import { createIdentity } from "@travel-crm/domain/identity";
import { createPlatformServices, checkPlatformConnection, type PlatformServices } from "@travel-crm/domain/platform";
import type { AiModel } from "@travel-crm/integrations/ai";
import { createMemoryJobAdministration, createMemoryJobQueue } from "@travel-crm/integrations/jobs";
import { createPinoLogger } from "@travel-crm/integrations/logging";
import { createMemoryStorage } from "@travel-crm/integrations/storage";
import { z } from "zod";
import { createAiModel } from "./ai-services.js";
import { agentBenchCommand, isLocalDatabaseUrl } from "./console-agent-bench.js";
import type { CommandOutput } from "./console-commands.js";
import { serviceVariables } from "./service-variables.js";

const postgresUrl = z.url({ protocol: /^postgres(ql)?$/, message: "must be a postgresql:// URL" });
const {
  OPENROUTER_API_KEY,
  AI_SUGGEST_MODELS,
  AI_SCORE_MODELS,
  AI_BASE_URL,
  AI_API_KEY,
  AI_CHAT_MODELS,
  AI_FAST_MODELS,
  AI_ZERO_RETENTION,
  AI_BACKUP_BASE_URL,
  AI_BACKUP_API_KEY,
  AI_BACKUP_CHAT_MODELS,
  AI_BACKUP_FAST_MODELS,
} = serviceVariables;

/** The bench's whole environment: the two addresses and the settings that make the model. */
const benchSettings = z.object({
  DATABASE_URL: postgresUrl,
  DATABASE_PLATFORM_URL: postgresUrl,
  OPENROUTER_API_KEY,
  AI_SUGGEST_MODELS,
  AI_SCORE_MODELS,
  AI_BASE_URL,
  AI_API_KEY,
  AI_CHAT_MODELS,
  AI_FAST_MODELS,
  AI_ZERO_RETENTION,
  AI_BACKUP_BASE_URL,
  AI_BACKUP_API_KEY,
  AI_BACKUP_CHAT_MODELS,
  AI_BACKUP_FAST_MODELS,
});
export type BenchSettings = z.infer<typeof benchSettings>;

export interface BenchServices {
  platform: PlatformServices;
  ai: AiModel | null;
  close(): Promise<void>;
}

/** Connects the two database roles and checks the platform one can step into an organization. */
export async function startBenchServices(settings: BenchSettings): Promise<BenchServices> {
  const logger = createPinoLogger({ process: "console", level: "warn", destination: process.stderr });
  const db = createDatabase(settings.DATABASE_URL, { maxConnections: 3 });
  // Identity is part of the platform's services but the bench never signs anyone in: a secret of its own, used by no one.
  const identity = createIdentity({
    databaseUrl: settings.DATABASE_URL,
    maxConnections: 2,
    auth: {
      appName: "Agent bench",
      secret: randomBytes(32).toString("base64"),
      baseUrl: "http://localhost",
      trustedOrigins: [],
      secureCookies: false,
      rateLimit: false,
      ipAddressHeaders: ["x-forwarded-for"],
      trustedProxies: [],
    },
  });
  const platform = createPlatformServices({
    platformDatabaseUrl: settings.DATABASE_PLATFORM_URL,
    maxConnections: 2,
    db,
    identity,
    storage: createMemoryStorage(),
    queue: createMemoryJobQueue(),
    jobs: createMemoryJobAdministration(),
    logger,
  });
  const close = async () => {
    await platform.platformDb.disconnect();
    await identity.disconnect();
    await db.disconnect();
  };
  try {
    await checkPlatformConnection(platform.platformDb);
  } catch (error) {
    await close().catch(() => undefined);
    throw error;
  }
  return { platform, ai: createAiModel({ ...settings, AI_TEST_SERVER_URL: undefined }), close };
}

export interface AgentBenchProcessOptions {
  variables: Readonly<Record<string, string | undefined>>;
  repositoryRoot: string;
  home: string;
  now: Date;
  /** For tests: stands in for connecting. */
  build?: typeof startBenchServices;
}

/** The whole command as a process runs it: refuse a database that is not here, read the settings, start, play, close. */
export async function runAgentBench(
  args: readonly string[],
  output: CommandOutput,
  { variables, repositoryRoot, home, now, build = startBenchServices }: AgentBenchProcessOptions,
): Promise<number> {
  const databaseUrls = [variables.DATABASE_URL ?? "", variables.DATABASE_PLATFORM_URL ?? ""];
  if (!databaseUrls.every(isLocalDatabaseUrl)) {
    output.stderr("Refused: the database is not on this computer (localhost, 127.0.0.1 or ::1).");
    return 1;
  }
  const parsed = benchSettings.safeParse(variables);
  if (!parsed.success) {
    // The names of what does not fit, never a value: a value can be a key.
    const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "settings")))];
    output.stderr(`These settings do not fit: ${names.join(", ")}.`);
    return 1;
  }
  const started = await build(parsed.data);
  try {
    return await agentBenchCommand(
      started.platform,
      { ai: started.ai, databaseUrls, repositoryRoot, home, now },
      args,
      output,
    );
  } finally {
    await started.close();
  }
}
