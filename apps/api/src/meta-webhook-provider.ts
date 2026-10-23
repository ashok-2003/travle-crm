// The webhook provider `meta-leads` (spec M5-M7, ADR 0034): POST /webhooks/meta-leads. Meta signs the raw body with the app
// secret in X-Hub-Signature-256 (sha256=<hex>); the intake refuses a bad one with nothing stored and answers 200 before any
// Graph call. The stored body holds ids only. The worker's `process` finds each change's agency by its Page and handles
// each change on its own, so one bad change never blocks its neighbours; a change that must be tried again is retried when
// the event is, and the ledger makes the repeat free.
import { createHash } from "node:crypto";
import { leadgenChangesOf } from "@travel-crm/contracts/meta-leads";
import { processLeadgenChange, type MetaProcessDependencies } from "@travel-crm/domain/crm";
import { routeOfMetaPage } from "@travel-crm/domain/meta-leads";
import { hmacSha256Signature, type WebhookProvider } from "@travel-crm/domain/webhooks";

export const META_LEADS_PROVIDER = "meta-leads";

/** The delivery's id: a single lead's own id, else a digest of the sorted ids, so a repeat of the delivery is stored once. */
function eventIdOf(ids: readonly string[]): string {
  const [only] = ids;
  if (ids.length === 1 && only !== undefined) return only;
  return `batch:${createHash("sha256")
    .update([...ids].sort().join(","))
    .digest("hex")
    .slice(0, 40)}`;
}

function bodyOf(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

export function metaLeadsProvider(options: {
  appSecret: string;
  dependencies: MetaProcessDependencies;
}): WebhookProvider {
  const { appSecret, dependencies } = options;
  return {
    name: META_LEADS_PROVIDER,
    keptHeaders: ["x-hub-signature-256"],
    verify: hmacSha256Signature({
      secret: appSecret,
      header: "x-hub-signature-256",
      prefix: "sha256=",
      encoding: "hex",
    }),
    identify: ({ rawBody }) => {
      const body = bodyOf(rawBody);
      if (typeof body !== "object" || body === null || (body as { object?: unknown }).object !== "page") return null;
      const changes = leadgenChangesOf(body);
      // A signed delivery with nothing for us (a field we did not subscribe) is stored and does nothing, so Meta is answered 200.
      if (changes.length === 0) {
        return {
          eventId: `empty:${createHash("sha256").update(rawBody).digest("hex").slice(0, 40)}`,
          eventType: "none",
        };
      }
      return { eventId: eventIdOf(changes.map((change) => change.leadgenId)), eventType: "leadgen" };
    },
    process: async (event, processing) => {
      const changes = leadgenChangesOf(bodyOf(event.payload));
      let failure: unknown = null;
      for (const change of changes) {
        try {
          // No route (never connected, or disconnected) is a quiet success: nothing of ours.
          const route = await routeOfMetaPage(dependencies.db, change.pageId);
          if (route === null) continue;
          processing.isAbout(route.organizationId);
          await processLeadgenChange(dependencies, route.organizationId, change, new Date());
        } catch (error) {
          failure ??= error;
        }
      }
      // The first failure is rethrown after every change had its turn, so the event is retried with backoff.
      if (failure !== null) throw failure instanceof Error ? failure : new Error("A Meta change failed");
    },
  };
}
