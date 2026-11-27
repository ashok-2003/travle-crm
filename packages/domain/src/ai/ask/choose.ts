// Ask your reports: the AI picks which report of the catalogue answers a question, and its range. It is told the question
// and the catalogue (ids, titles, whether a report takes a range) and nothing of the agency's data; it answers a report and a
// range, or that it cannot. The question is kept nowhere: the monthly count is all that remembers it was asked. Three short
// transactions around the model, as Suggest reply has; a model that fails gives its call back.
import { askChoice, askRange, askRanges, type AskRange, type ReportQueryId } from "@travel-crm/contracts/reports";
import type { Database, OrgTx } from "@travel-crm/db";
import type { AiModel } from "@travel-crm/integrations/ai";
import type { AiPrompts } from "@travel-crm/integrations/prompts";
import { organizationTimeZone, type MemberAccess } from "../../identity/index.js";
import { DomainError } from "../../kernel/index.js";
import { jsonObjectIn } from "../fill/json.js";
import { managedPrompt } from "../managed-prompt.js";
import { aiEnabled } from "../settings.js";
import { ASK_REPORTS_PROMPT_TEXT } from "./prompt-text.js";
import { monthlyAiLimitOf, recordTokens, releaseAiCall, reserveAiCall, usedThisMonth } from "../usage.js";

export interface CatalogueEntry {
  id: ReportQueryId;
  title: string;
  ranged: boolean;
}

export type Chosen =
  | { kind: "report"; queryId: ReportQueryId; range: AskRange | null }
  /** `closest` are catalogue ids the model thought nearest, checked against the catalogue the member may use. */
  | { kind: "cannot"; closest: ReportQueryId[] };

/** The Langfuse prompt (label production) the choice runs on; its built-in text is in prompt-text.ts. */
export const ASK_REPORTS_PROMPT_NAME = "ask-reports/system";

const fenced = (text: string) => text.replaceAll("<", "‹").replaceAll(">", "›");

const refuse = (reason: string, message: string, code: "CONFLICT" | "LIMIT_REACHED" = "CONFLICT") =>
  new DomainError(code, reason, message);

async function prepare(tx: OrgTx, access: MemberAccess, now: Date): Promise<string> {
  if (!(await aiEnabled(tx))) {
    throw refuse("AI_OFF", "The AI is off for this agency: an Owner or Admin turns it on in Settings, AI");
  }
  const timeZone = await organizationTimeZone(tx, access.organizationId);
  if (!(await reserveAiCall(tx, now, timeZone))) {
    throw refuse("AI_MONTH_LIMIT", "This agency has used this month's AI suggestions", "LIMIT_REACHED");
  }
  return timeZone;
}

/** What the model answered, read leniently against the catalogue it was shown. */
export function chosenFrom(text: string, catalogue: readonly CatalogueEntry[]): Chosen {
  const parsed = askChoice.safeParse(jsonObjectIn(text));
  if (!parsed.success) return { kind: "cannot", closest: [] };
  const { queryId, params, closest } = parsed.data;
  const entry = catalogue.find((one) => one.id === queryId);
  if (entry !== undefined) {
    const asked = askRange.safeParse(params?.range);
    return { kind: "report", queryId: entry.id, range: entry.ranged ? (asked.success ? asked.data : "30d") : null };
  }
  const known = (closest ?? []).flatMap((id) => catalogue.filter((one) => one.id === id).map((one) => one.id));
  return { kind: "cannot", closest: [...new Set(known)].slice(0, 3) };
}

/**
 * Chooses the report for a question. Refused when the AI is off, the month's limit is used, or the AI doesn't answer (the
 * call is then given back). The plan's module and the member's permissions are the router's; `catalogue` is only what the
 * member may run.
 */
export async function chooseReport(
  db: Database,
  model: AiModel,
  access: MemberAccess,
  question: string,
  catalogue: readonly CatalogueEntry[],
  now: Date,
  prompts?: AiPrompts,
): Promise<{ chosen: Chosen; usedThisMonth: number; monthlyLimit: number }> {
  const { organizationId } = access;
  if (!model.configured) throw refuse("AI_NOT_READY", "The AI isn't set up on this server yet");
  const timeZone = await db.forOrg(organizationId, (tx) => prepare(tx, access, now));
  const list = catalogue
    .map((entry) => `- ${entry.id}: ${entry.title}. ${entry.ranged ? `Ranges: ${askRanges.join(", ")}` : "No range"}`)
    .join("\n");
  const prompt = await managedPrompt(prompts, ASK_REPORTS_PROMPT_NAME, ASK_REPORTS_PROMPT_TEXT);
  const result = await model.complete({
    feature: "ask_report",
    messages: [
      { role: "system", content: prompt.text },
      { role: "user", content: `The reports:\n${list}\n\nThe question:\n<data>${fenced(question)}</data>` },
    ],
    ...(prompt.source ? { prompt: { name: prompt.source.name, version: prompt.source.version } } : {}),
    json: true,
    maxTokens: 200,
    // Opaque: the agency's id, never a person's.
    user: organizationId,
  });
  if (!result.ok) {
    await db.forOrg(organizationId, (tx) => releaseAiCall(tx, now, timeZone));
    throw result.reason === "rate_limited"
      ? refuse("AI_BUSY", "The AI is busy right now")
      : result.reason === "not_configured"
        ? refuse("AI_NOT_READY", "The AI isn't set up on this server yet")
        : refuse("AI_UNAVAILABLE", "The AI didn't answer");
  }
  const used = await db.forOrg(organizationId, async (tx) => {
    await recordTokens(tx, now, timeZone, { input: result.inputTokens, output: result.outputTokens });
    return { used: await usedThisMonth(tx, now, timeZone), monthlyLimit: await monthlyAiLimitOf(tx) };
  });
  return { chosen: chosenFrom(result.text, catalogue), usedThisMonth: used.used, monthlyLimit: used.monthlyLimit };
}
