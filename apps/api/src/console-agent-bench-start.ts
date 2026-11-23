// The agent bench's own, lean start: it reads only the two database addresses, the AI settings and Langfuse's, and builds
// only what the bench uses (the database, in-memory storage, queue and jobs, the AI model, its tracing). No object-storage
// bucket check, mail, push or auth settings, no pg-boss: a checkout with a model key and Docker is enough. The
// local-database check comes first, before anything connects.
import { randomBytes } from "node:crypto";
import { createDatabase } from "@travel-crm/db";
import { createIdentity } from "@travel-crm/domain/identity";
import { createPlatformServices, checkPlatformConnection, type PlatformServices } from "@travel-crm/domain/platform";
import type { AiModel } from "@travel-crm/integrations/ai";
import type { AiTracing } from "@travel-crm/integrations/tracing";
import { createMemoryJobAdministration, createMemoryJobQueue } from "@travel-crm/integrations/jobs";
import { createPinoLogger } from "@travel-crm/integrations/logging";
import { createMemoryStorage } from "@travel-crm/integrations/storage";
import { z } from "zod";
import { createAiModel } from "./ai-services.js";
import { agentBenchCommand, isLocalDatabaseUrl } from "./console-agent-bench.js";
import { langfuseProblems, tracingOf } from "./langfuse-settings.js";
import type { CommandOutput } from "./console-commands.js";
import { serviceVariables } from "./service-variables.js";

const postgresUrl = z.url({ protocol: /^postgres(ql)?$/, message: "must be a postgresql:// URL" });
const {
  OPENROUTER_API_KEY,
  AI_SUGGEST_MODELS,
  AI_SCORE_MODELS,
  AI_BASE_URL,
  AI_API_KEY,
  AI_VERTEX_SERVICE_ACCOUNT,
  AI_CHAT_MODELS,
  AI_FAST_MODELS,
  AI_AGENT_MODELS,
  AI_VOICE_MODELS,
  AI_IMAGE_MODELS,
  AI_SUMMARY_MODELS,
  AI_ZERO_RETENTION,
  AI_BACKUP_BASE_URL,
  AI_BACKUP_API_KEY,
  AI_BACKUP_API_KEY_2,
  AI_BACKUP_CHAT_MODELS,
  AI_BACKUP_FAST_MODELS,
  AI_FALLBACK_BASE_URL,
  AI_FALLBACK_API_KEY,
  AI_FALLBACK_MODELS,
  AI_FALLBACK_2_BASE_URL,
  AI_FALLBACK_2_API_KEY,
  AI_FALLBACK_2_MODELS,
  AI_PRIMARY_BASE_URL,
  AI_PRIMARY_API_KEY,
  AI_PRIMARY_MODELS,
  LANGFUSE_PUBLIC_KEY,
  LANGFUSE_SECRET_KEY,
  LANGFUSE_BASE_URL,
  LANGFUSE_TRACING_ENVIRONMENT,
} = serviceVariables;

/** The bench's whole environment: the two addresses, the settings that make the model, and Langfuse's. */
const benchSettings = z
  .object({
    DATABASE_URL: postgresUrl,
    DATABASE_PLATFORM_URL: postgresUrl,
    OPENROUTER_API_KEY,
    AI_SUGGEST_MODELS,
    AI_SCORE_MODELS,
    AI_BASE_URL,
    AI_API_KEY,
    AI_VERTEX_SERVICE_ACCOUNT,
    AI_CHAT_MODELS,
    AI_FAST_MODELS,
    AI_AGENT_MODELS,
    AI_VOICE_MODELS,
    AI_IMAGE_MODELS,
    AI_SUMMARY_MODELS,
    AI_ZERO_RETENTION,
    AI_BACKUP_BASE_URL,
    AI_BACKUP_API_KEY,
    AI_BACKUP_API_KEY_2,
    AI_BACKUP_CHAT_MODELS,
    AI_BACKUP_FAST_MODELS,
    AI_FALLBACK_BASE_URL,
    AI_FALLBACK_API_KEY,
    AI_FALLBACK_MODELS,
    AI_FALLBACK_2_BASE_URL,
    AI_FALLBACK_2_API_KEY,
    AI_FALLBACK_2_MODELS,
    AI_PRIMARY_BASE_URL,
    AI_PRIMARY_API_KEY,
    AI_PRIMARY_MODELS,
    LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY,
    LANGFUSE_BASE_URL,
    LANGFUSE_TRACING_ENVIRONMENT,
  })
  .superRefine((settings, context) => {
    for (const { name, message } of langfuseProblems(settings, false)) {
      context.addIssue({ code: "custom", path: [name], message });
    }
  });
export type BenchSettings = z.infer<typeof benchSettings>;

export interface BenchServices {
  platform: PlatformServices;
  ai: AiModel | null;
  tracing: AiTracing;
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
  // The bench runs on a laptop: its traces go under "development" unless LANGFUSE_TRACING_ENVIRONMENT says otherwise.
  const tracing = tracingOf(settings, "development");
  const close = async () => {
    await tracing.shutdown();
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
  return {
    platform,
    ai: createAiModel({ ...settings, AI_TEST_SERVER_URL: undefined }, logger, tracing),
    tracing,
    close,
  };
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
      { ai: started.ai, tracing: started.tracing, databaseUrls, repositoryRoot, home, now },
      args,
      output,
    );
  } finally {
    await started.close();
  }
}
