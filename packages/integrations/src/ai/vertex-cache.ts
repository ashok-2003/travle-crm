// Vertex AI's explicit context cache: a big system message and its tools, the same on every call of an agency's agent, are
// made into a cache that lives an hour, and each request names it instead of sending them again. Cached tokens cost a
// tenth of the input price, and Vertex's implicit caching missed every live probe (2026-11-18). The caches are kept per
// process, 50 at most, and never patched or deleted: an old one simply expires. A cache that can't be made costs only its
// try, and the request goes as it would have.
import { createHash } from "node:crypto";
import type { AiRequest, AiTool } from "./ai-model.js";

/** Below this many characters of system text and tools' JSON, no cache: Vertex's least is 4,096 tokens. */
export const CACHE_MIN_CHARS = 20_000;
const TTL_SECONDS = 3600;
/** A cache with less than this left is made again, so no request names one that ends on its way. */
const RENEW_LEFT_MS = 5 * 60_000;
const MAX_CACHES = 50;

/** The cache a request names in place of its system message and tools, and how to forget it when Vertex refuses it. */
export interface CachedPrefix {
  name: string;
  forget(): void;
}

/** A request's cache, made when missing or nearly over; null when the request gets none. */
export type VertexCache = (
  request: AiRequest,
  model: string,
  bearer: string,
  signal: AbortSignal,
) => Promise<CachedPrefix | null>;

/**
 * Where Vertex makes caches and the model's full name, from the OpenAI-compatible base URL
 * (…/v1/projects/<p>/locations/<loc>/endpoints/openapi) and a model named publisher/id; null for any other shape.
 */
function targetOf(baseUrl: string, model: string): { url: string; model: string } | null {
  const [, root, location] =
    /^(https:\/\/[^/]+\/v1\/)(projects\/[^/]+\/locations\/[^/]+)\/endpoints\/openapi$/.exec(baseUrl) ?? [];
  const [, publisher, id] = /^([^/]+)\/([^/]+)$/.exec(model) ?? [];
  if (root === undefined || location === undefined || publisher === undefined || id === undefined) return null;
  return { url: `${root}${location}/cachedContents`, model: `${location}/publishers/${publisher}/models/${id}` };
}

/** Makes the cache, our JSON Schemas sent as they are; its name, or null for any failure (nothing of it is kept). */
async function make(
  send: typeof fetch,
  target: { url: string; model: string },
  system: string,
  tools: readonly AiTool[],
  bearer: string,
  signal: AbortSignal,
): Promise<string | null> {
  try {
    const response = await send(target.url, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${bearer}` },
      body: JSON.stringify({
        model: target.model,
        systemInstruction: { parts: [{ text: system }] },
        ...(tools.length === 0
          ? {}
          : {
              tools: [
                {
                  functionDeclarations: tools.map(({ name, description, parameters }) => ({
                    name,
                    description,
                    parametersJsonSchema: parameters,
                  })),
                },
              ],
            }),
        ttl: `${String(TTL_SECONDS)}s`,
      }),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { name?: unknown };
    return typeof body.name === "string" && body.name !== "" ? body.name : null;
  } catch {
    return null;
  }
}

export function createVertexCache(baseUrl: string, send: typeof fetch): VertexCache {
  /** Each cache by its key, or the making of it while that is under way, so two calls never make the same one. */
  const caches = new Map<string, { name: string; expiresAt: number } | Promise<string | null>>();
  const keep = (key: string, entry: { name: string; expiresAt: number } | Promise<string | null>) => {
    caches.delete(key);
    caches.set(key, entry);
    const oldest = caches.keys().next().value;
    if (caches.size > MAX_CACHES && oldest !== undefined) caches.delete(oldest);
  };
  return async (request, model, bearer, signal) => {
    const [system] = request.messages;
    const tools = request.tools ?? [];
    // A request naming a cache may send no tool choice: "auto" is Vertex's default, but "none" would be lost.
    if (system?.role !== "system" || request.toolChoice === "none") return null;
    if (system.content.length + JSON.stringify(tools).length < CACHE_MIN_CHARS) return null;
    const target = targetOf(baseUrl, model);
    if (target === null) return null;
    const key = createHash("sha256")
      .update(JSON.stringify([model, system.content, tools]))
      .digest("hex");
    const named = (name: string | null): CachedPrefix | null =>
      name === null
        ? null
        : {
            name,
            forget: () => {
              caches.delete(key);
            },
          };
    const held = caches.get(key);
    if (held instanceof Promise) return named(await held);
    if (held !== undefined && held.expiresAt - Date.now() > RENEW_LEFT_MS) return named(held.name);
    const expiresAt = Date.now() + TTL_SECONDS * 1000;
    const making = make(send, target, system.content, tools, bearer, signal);
    keep(key, making);
    const name = await making;
    if (name === null) caches.delete(key);
    else keep(key, { name, expiresAt });
    return named(name);
  };
}
