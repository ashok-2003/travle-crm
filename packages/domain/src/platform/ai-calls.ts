// The AI's calls one by one for the console (the owner, 2026-11-02: every log line): newest first, a page at a time,
// for every agency or one, all or only the failed; each with its agency's name and its cost. Also the pruning of calls
// older than 90 days, which the console's health check runs.
import type { AiCallsPage, ListAiCallsInput } from "@travel-crm/contracts/platform";
import { aiCallOutcome, listAiCallsInput } from "@travel-crm/contracts/platform";
import { calendarDateIn, DomainError, isUuid } from "../kernel/index.js";
import { aiPricing } from "./ai-pricing.js";
import type { PlatformServices } from "./services.js";

const KEPT_DAYS = 90;

/** "<occurredAt>_<id>", as a page's nextCursor gives it; anything else is refused. */
function cursorOf(text: string): { occurredAt: string; id: string } {
  const [occurredAt = "", id = ""] = text.split("_");
  if (Number.isNaN(Date.parse(occurredAt)) || !isUuid(id)) {
    throw new DomainError("VALIDATION", "AI_CALLS_CURSOR_INVALID", "That page of calls doesn't exist");
  }
  return { occurredAt, id };
}

export async function listAiCalls(services: PlatformServices, raw: ListAiCallsInput): Promise<AiCallsPage> {
  const input = listAiCallsInput.parse(raw);
  const pricing = aiPricing(services.usdInrRate ?? 96, services.aiPrices ?? null);
  const before = input.before === undefined ? undefined : cursorOf(input.before);
  const { rows, names } = await services.platformDb.transaction(async (tx) => {
    const found = await tx.aiCall.findMany({
      where: {
        ...(input.organizationId === undefined ? {} : { organizationId: input.organizationId }),
        ...(input.failedOnly ? { outcome: { in: ["rate_limited", "unavailable"] } } : {}),
        ...(before === undefined
          ? {}
          : {
              OR: [
                { occurredAt: { lt: new Date(before.occurredAt) } },
                { occurredAt: new Date(before.occurredAt), id: { lt: before.id } },
              ],
            }),
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
    });
    // The names apart: a relation from a call to the organization would reach a sign-in table.
    const organizations = await tx.organization.findMany({
      where: { id: { in: [...new Set(found.map((row) => row.organizationId))] } },
      select: { id: true, name: true },
    });
    return { rows: found, names: new Map(organizations.map((organization) => [organization.id, organization.name])) };
  });
  const page = rows.slice(0, input.limit);
  const last = page.at(-1);
  return {
    calls: page.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      organizationName: names.get(row.organizationId) ?? "",
      occurredAt: row.occurredAt.toISOString(),
      feature: row.feature,
      model: row.model,
      outcome: aiCallOutcome.parse(row.outcome),
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      durationMs: row.durationMs,
      costPaise: pricing.costPaise(row.model, calendarDateIn(row.occurredAt, "Asia/Kolkata"), {
        input: row.inputTokens,
        output: row.outputTokens,
      }),
    })),
    nextCursor: rows.length > input.limit && last !== undefined ? `${last.occurredAt.toISOString()}_${last.id}` : null,
  };
}

/** Removes the calls older than 90 days; returns how many. */
export async function pruneAiCalls(services: PlatformServices, now: Date): Promise<number> {
  const { count } = await services.platformDb.transaction((tx) =>
    tx.aiCall.deleteMany({ where: { occurredAt: { lt: new Date(now.getTime() - KEPT_DAYS * 86_400_000) } } }),
  );
  return count;
}
