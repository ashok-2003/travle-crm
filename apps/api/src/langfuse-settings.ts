// Langfuse's settings (the owner, 2026-11-16): their checks, and the one tracing and the one prompts reader a process builds
// from them. Unset, nothing is traced and the natural agent runs on its built-in prompt. The keys are secrets: a problem
// names the variable, never its value.
import { createLangfusePrompts, noPrompts, type AiPrompts } from "@travel-crm/integrations/prompts";
import { createLangfuseTracing, noTracing, type AiTracing } from "@travel-crm/integrations/tracing";

export interface LangfuseSettings {
  LANGFUSE_PUBLIC_KEY?: string | undefined;
  LANGFUSE_SECRET_KEY?: string | undefined;
  LANGFUSE_BASE_URL?: string | undefined;
  LANGFUSE_TRACING_ENVIRONMENT?: string | undefined;
}

/** What is wrong with the settings, by variable: the keys come together, with an address, over https in production. */
export function langfuseProblems(
  settings: LangfuseSettings,
  production: boolean,
): { name: keyof LangfuseSettings; message: string }[] {
  const { LANGFUSE_PUBLIC_KEY: publicKey, LANGFUSE_SECRET_KEY: secretKey, LANGFUSE_BASE_URL: baseUrl } = settings;
  const problems: { name: keyof LangfuseSettings; message: string }[] = [];
  if (publicKey !== undefined && secretKey === undefined) {
    problems.push({ name: "LANGFUSE_SECRET_KEY", message: "is needed with LANGFUSE_PUBLIC_KEY" });
  }
  if (secretKey !== undefined && publicKey === undefined) {
    problems.push({ name: "LANGFUSE_PUBLIC_KEY", message: "is needed with LANGFUSE_SECRET_KEY" });
  }
  const keys = publicKey !== undefined || secretKey !== undefined;
  // The SDK's own default is the EU region: the address is always said, so traces never go to a region by accident.
  if (keys && baseUrl === undefined) {
    problems.push({ name: "LANGFUSE_BASE_URL", message: "is needed with the Langfuse keys" });
  }
  if (!keys && baseUrl !== undefined) {
    problems.push({ name: "LANGFUSE_BASE_URL", message: "is only for use with the Langfuse keys" });
  }
  // The keys and the customers' words go in every export: over https only.
  if (production && baseUrl !== undefined && !baseUrl.startsWith("https://")) {
    problems.push({ name: "LANGFUSE_BASE_URL", message: "must be an https address in production" });
  }
  return problems;
}

/**
 * The process's one tracing: Langfuse with the keys set, none without. Its environment is LANGFUSE_TRACING_ENVIRONMENT, or
 * `fallbackEnvironment` (NODE_ENV in the processes).
 */
export function tracingOf(settings: LangfuseSettings, fallbackEnvironment: string): AiTracing {
  const { LANGFUSE_PUBLIC_KEY: publicKey, LANGFUSE_SECRET_KEY: secretKey, LANGFUSE_BASE_URL: baseUrl } = settings;
  if (publicKey === undefined || secretKey === undefined || baseUrl === undefined) return noTracing;
  return createLangfuseTracing({
    publicKey,
    secretKey,
    baseUrl,
    environment: settings.LANGFUSE_TRACING_ENVIRONMENT ?? fallbackEnvironment,
  });
}

/** The process's one prompts reader (its cache shared by every turn): the same Langfuse project as the tracing, or none. */
export function promptsOf(settings: LangfuseSettings): AiPrompts {
  const { LANGFUSE_PUBLIC_KEY: publicKey, LANGFUSE_SECRET_KEY: secretKey, LANGFUSE_BASE_URL: baseUrl } = settings;
  if (publicKey === undefined || secretKey === undefined || baseUrl === undefined) return noPrompts;
  return createLangfusePrompts({ publicKey, secretKey, baseUrl });
}
