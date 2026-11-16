// The Langfuse adapter of the prompts port, through Langfuse's client and its cache: after a prompt's first fetch the
// cache serves it at once, and once it is older than the TTL serves it still while fetching it again in the background
// (Langfuse's caching docs). A Langfuse that is slow or down costs a call at most `timeoutMs`: a fetch the cache can't
// answer is waited for that long, then the call answers null (the caller's own text) while the fetch, if it ends, fills
// the cache; for `retryAfterMs` after such a wait, the same prompt answers null at once instead of waiting again. Nothing
// here throws: a refusal, a missing prompt and an answer of the wrong shape are all null.
import { LangfuseClient, type ChatPromptClient, type TextPromptClient } from "@langfuse/client";
import type { AiPrompts, ManagedPrompt } from "./ai-prompts.js";

export interface LangfusePromptsOptions {
  publicKey: string;
  secretKey: string;
  /** The project's region, e.g. https://us.cloud.langfuse.com. */
  baseUrl: string;
  /** How long a call waits for a prompt the cache doesn't hold: 2 seconds by default. */
  timeoutMs?: number;
  /** How long the cache serves a prompt before fetching it again behind it: 60 seconds, the SDK's own default. */
  cacheTtlSeconds?: number;
  /** After a call waited its bound in vain, how long the prompt answers null at once: 30 seconds by default. */
  retryAfterMs?: number;
}

/**
 * The fetch itself is cut off a little after the call stops waiting, so the call's own bound always ends first and a
 * hanging request never outlives it by much.
 */
const FETCH_GRACE_MS = 500;
const LATE = Symbol("late");

/** `work`'s answer, or LATE when it takes longer than `ms`; `work` must not reject. */
async function within<T>(ms: number, work: Promise<T>): Promise<T | typeof LATE> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<typeof LATE>((resolve) => {
    timer = setTimeout(() => {
      resolve(LATE);
    }, ms);
    timer.unref();
  });
  try {
    return await Promise.race([work, late]);
  } finally {
    clearTimeout(timer);
  }
}

/** A text prompt with words, as the port gives it; anything else (a chat prompt, a fallback, no words) is none. */
function managedOf(found: TextPromptClient | ChatPromptClient, label: string): ManagedPrompt | null {
  if (found.isFallback || found.type !== "text" || typeof found.prompt !== "string") return null;
  if (found.prompt.trim() === "" || !Number.isInteger(found.version)) return null;
  return { name: found.name, version: found.version, label, text: found.prompt };
}

export function createLangfusePrompts(options: LangfusePromptsOptions): AiPrompts {
  const timeoutMs = options.timeoutMs ?? 2_000;
  const cacheTtlSeconds = options.cacheTtlSeconds ?? 60;
  const retryAfterMs = options.retryAfterMs ?? 30_000;
  const client = new LangfuseClient({
    publicKey: options.publicKey,
    secretKey: options.secretKey,
    baseUrl: options.baseUrl,
  });
  /** When each prompt that kept a call waiting in vain may be waited for again. */
  const quietUntil = new Map<string, number>();

  return {
    async textPrompt(name, label, request = {}) {
      const fresh = request.fresh === true;
      const key = JSON.stringify([name, label, fresh]);
      if ((quietUntil.get(key) ?? 0) > Date.now()) return null;
      const fetching = Promise.resolve()
        .then(() =>
          client.prompt.get(name, {
            type: "text",
            label,
            // A cache time of 0 is the SDK's way to ask Langfuse every time.
            cacheTtlSeconds: fresh ? 0 : cacheTtlSeconds,
            // One try: a retry would wait past the bound.
            maxRetries: 0,
            fetchTimeoutMs: timeoutMs + FETCH_GRACE_MS,
          }),
        )
        .then(
          (found) => managedOf(found, label),
          () => null,
        );
      const answer = await within(timeoutMs, fetching);
      if (answer !== LATE) return answer;
      quietUntil.set(key, Date.now() + retryAfterMs);
      // A fetch that ends after all has filled the cache: the next call may use it at once.
      void fetching.then((late) => {
        if (late !== null) quietUntil.delete(key);
      });
      return null;
    },
  };
}
