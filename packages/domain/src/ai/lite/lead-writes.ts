// What the lite turn writes on the lead and the chat: trip fields only where empty or still the AI's own, each marked and
// put on the timeline, the chat's summary, and the lead's score row. A person's value is never replaced.
import { withoutAmountsAndDates, type LiteFacts, type UnderstandForm } from "@travel-crm/contracts/ai";
import type { AiFilledField, TravelWhen } from "@travel-crm/contracts/crm";
import type { FillPath } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../../audit/index.js";
import { destinationNames } from "../../catalog/index.js";
import {
  fillTripGaps,
  lockLead,
  recordLeadEvent,
  tripFieldValues,
  type GapField,
  type TripGaps,
} from "../../crm/index.js";
import { addDays, DomainError, formatShortDay, systemActor, type CalendarDate } from "../../kernel/index.js";
import { valueHash } from "../fill/values.js";
import type { LeadInsightRow } from "../insight.js";
import type { CheckedForm } from "./types.js";

export interface LeadWriteInput {
  organizationId: string;
  leadId: string;
  facts: LiteFacts;
  pkg: { destinationId: string | null; nights: number | null } | null;
  departureStartsOn: CalendarDate | null;
  proofs: CheckedForm["proofs"];
  today: CalendarDate;
}

export type TripField = "destination" | "when" | "adults" | "children_ages" | "departure_city" | "room_type";

/** The path each trip field's value is hashed under, so a value can be told as still the AI's own. */
export const aiFieldPaths: Record<TripField, FillPath> = {
  destination: "trip.destination",
  when: "trip.when",
  adults: "trip.adults",
  children_ages: "trip.childrenAges",
  departure_city: "trip.departureCity",
  room_type: "trip.roomType",
};
const SUMMARY_MAX = 800;
const EXCERPT_MAX = 200;
const WORDS_MAX = 120;
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A value as the timeline says it: "Sat 14 Nov to Wed 18 Nov", "Dec 2026", "3", "8, 10", "Delhi". */
function wordsOf(
  field: TripField,
  value: unknown,
  today: CalendarDate,
  destinations: ReadonlyMap<string, string>,
): string {
  switch (field) {
    case "destination": {
      const id = (value as { destinationId?: string }).destinationId;
      return (id === undefined ? undefined : destinations.get(id)) ?? "";
    }
    case "when": {
      const when = value as TravelWhen;
      if (when.kind === "dates")
        return `${formatShortDay(when.from as CalendarDate, today)} to ${formatShortDay(when.to as CalendarDate, today)}`;
      if (when.kind === "month") {
        const [year = "", month = "1"] = when.month.split("-");
        return `${months[Number(month) - 1] ?? ""} ${year}`;
      }
      return when.kind === "flexible" ? "Flexible" : "";
    }
    case "children_ages":
      return (value as number[]).join(", ");
    default:
      return String(value);
  }
}

/** The values the facts ask for, by field; a field the facts do not settle is absent. */
function desiredOf(input: LeadWriteInput): Partial<Record<TripField, unknown>> {
  const { facts, pkg, departureStartsOn } = input;
  const desired: Partial<Record<TripField, unknown>> = {};
  if (pkg?.destinationId != null) desired.destination = { kind: "existing", destinationId: pkg.destinationId };
  if (facts.departureId !== null && departureStartsOn !== null) {
    desired.when = { kind: "dates", from: departureStartsOn, to: addDays(departureStartsOn, pkg?.nights ?? 0) };
  } else if (facts.month !== null) desired.when = { kind: "month", month: facts.month };
  if (facts.adults !== null) desired.adults = facts.adults;
  // Ages only when every child has one: a count without ages is not a list of ages.
  if (facts.children !== null && facts.children.count > 0 && facts.children.ages.length === facts.children.count)
    desired.children_ages = facts.children.ages;
  if (facts.pickupCity !== null) desired.departure_city = facts.pickupCity;
  if (facts.roomType !== null) desired.room_type = facts.roomType;
  return desired;
}

function gapsOf(values: Partial<Record<TripField, unknown>>): TripGaps {
  const gaps: TripGaps = {};
  const destination = values.destination as { destinationId: string } | undefined;
  if (destination !== undefined) gaps.destinationId = destination.destinationId;
  if (values.when !== undefined) gaps.when = values.when as TravelWhen;
  if (values.adults !== undefined) gaps.adults = values.adults as number;
  if (values.children_ages !== undefined) gaps.childrenAges = values.children_ages as number[];
  if (values.departure_city !== undefined) gaps.departureCity = values.departure_city as string;
  if (values.room_type !== undefined) gaps.roomType = values.room_type as string;
  return gaps;
}

/**
 * Fills the lead's trip from what the chat has settled: a field that is empty, or that the AI filled itself and nobody
 * has touched since (its value still hashes to the row's). A person's value and a dismissed field are left. Returns the
 * fields it set or changed.
 */
export async function writeLeadFromFacts(tx: OrgTx, input: LeadWriteInput): Promise<AiFilledField[]> {
  const { organizationId, leadId, today } = input;
  // Held until the transaction ends, so a person's save cannot slip in between the checks below and the write.
  try {
    await lockLead(tx, leadId);
  } catch (error) {
    // A lead deleted mid-chat is nothing to write on, not a failed turn.
    if (error instanceof DomainError && error.code === "NOT_FOUND") return [];
    throw error;
  }
  const current = await tripFieldValues(tx, leadId);
  if (current === null) return [];
  const rows = new Map((await tx.leadAiField.findMany({ where: { leadId } })).map((row) => [row.field, row]));
  const desired = desiredOf(input);
  const toWrite: Partial<Record<TripField, unknown>> = {};
  const skip = new Set<GapField>();
  const overwrite = new Set<GapField>();
  for (const field of Object.keys(desired) as TripField[]) {
    const row = rows.get(field);
    if (row?.state === "dismissed") {
      skip.add(field);
      continue;
    }
    const now = current[field];
    if (now === null) {
      // A row means the AI filled it once; empty now, a person cleared it, and clearing is theirs to choose.
      if (row === undefined) toWrite[field] = desired[field];
      else skip.add(field);
    } else if (
      row?.state === "suggested" &&
      valueHash(aiFieldPaths[field], now) === row.valueHash &&
      valueHash(aiFieldPaths[field], desired[field]) !== row.valueHash
    ) {
      toWrite[field] = desired[field];
      overwrite.add(field);
    }
  }
  if (Object.keys(toWrite).length === 0) return [];
  const written = (await fillTripGaps(tx, leadId, gapsOf(toWrite), skip, overwrite)) as TripField[];
  const ids = [current.destination, toWrite.destination].flatMap((one) =>
    one === null || one === undefined ? [] : [(one as { destinationId: string }).destinationId],
  );
  const names = await destinationNames(tx, ids);
  const actor = systemActor(organizationId);
  const set: AiFilledField[] = [];
  const changed: AiFilledField[] = [];
  for (const field of written) {
    const proof = input.proofs[field];
    const row = {
      state: "suggested",
      valueHash: valueHash(aiFieldPaths[field], desired[field]),
      excerpt: (proof?.excerpt ?? "").slice(0, EXCERPT_MAX),
      messageIds: proof?.messageIds ?? [],
    };
    await tx.leadAiField.upsert({
      where: { organizationId_leadId_field: { organizationId, leadId, field } },
      create: { leadId, field, ...row },
      update: row,
    });
    const replaced = overwrite.has(field);
    await recordLeadEvent(tx, actor, {
      leadId,
      kind: "ai-field-set",
      byAi: true,
      aiField: {
        field,
        from: replaced ? wordsOf(field, current[field], today, names).slice(0, WORDS_MAX) : null,
        to: wordsOf(field, desired[field], today, names).slice(0, WORDS_MAX),
      },
    });
    (replaced ? changed : set).push(field);
  }
  if (set.length > 0) {
    await recordAudit(tx, actor, {
      action: "ai.lead-filled",
      entityType: "lead",
      entityId: leadId,
      after: { fields: set },
    });
  }
  if (changed.length > 0) {
    await recordAudit(tx, actor, {
      action: "ai.lead-field-changed",
      entityType: "lead",
      entityId: leadId,
      after: { fields: changed },
    });
  }
  return [...set, ...changed];
}

/** The chat's notes on the customer: prices, dates and seat numbers taken out, at most 800 characters. */
export async function saveChatSummary(tx: OrgTx, conversationId: string, summary: string): Promise<void> {
  await tx.aiChat.updateMany({
    where: { conversationId },
    data: { summary: withoutAmountsAndDates(summary).trim().slice(0, SUMMARY_MAX) },
  });
}

/** The lead page's guess, from the score the Understand form carried; its budget stays unknown (the chat is not asked). */
export function liteInsightOf(
  score: UnderstandForm["score"],
  facts: { destination: string | null; when: string | null; travellers: string | null },
  model: string,
): LeadInsightRow {
  return {
    score: score.chance,
    label: score.label,
    reasons: score.reasons,
    fake: score.looks_fake,
    fakeReason: score.looks_fake && score.fake_why !== "" ? score.fake_why : null,
    summary: score.standing,
    nextStep: score.next_step,
    facts: { ...facts, budget: null },
    model,
  };
}
