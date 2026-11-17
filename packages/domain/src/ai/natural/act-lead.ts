// What a natural turn leaves on the lead (spec 3.3, 4.5): update_lead's trip fields marked as the AI's (a person's value
// stays; the customer's other one came staged as a note), the customer's own name over a WhatsApp stand-in, the notes,
// the tasks, a Lost or Not a lead suggestion for a person to decide, and the stage forward only. Act calls it with the
// chat's row already locked, so each lead lock here comes second, as on the inbound path.
import type { ToldTotal } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { addAiLeadNote, advanceLeadStage, renameWhatsAppPerson } from "../../crm/index.js";
import { addDays, systemActor } from "../../kernel/index.js";
import type { ChatPerson } from "../lite/act-lead.js";
import { usableName } from "../lite/decide/stage.js";
import { writeAiTripFields, type TripField } from "../lite/lead-writes.js";
import { suggestStage } from "../lite/suggestions.js";
import { addTurnTasks } from "./act-task.js";
import { stagedOf, type NaturalActDeps, type NaturalActInput, type StagedOf } from "./act-types.js";
import { isText } from "./trips/trip-text.js";

type LeadFields = StagedOf<"update_lead">["fields"];

/** update_lead's fields as lite's trip fields: a trip by its place, a day as the trip's dates, a month as itself. */
function tripValuesOf(fields: LeadFields, input: NaturalActInput): Partial<Record<TripField, unknown>> {
  const values: Partial<Record<TripField, unknown>> = {};
  const sheet = input.sheets.find((one) => one.packageId === fields.packageId);
  if (sheet?.destinationId != null) values.destination = { kind: "existing", destinationId: sheet.destinationId };
  if (fields.day !== undefined) {
    values.when = { kind: "dates", from: fields.day, to: addDays(fields.day, sheet?.nights ?? 0) };
  } else if (fields.month !== undefined) values.when = { kind: "month", month: fields.month };
  if (fields.adults !== undefined) values.adults = fields.adults;
  // A list of ages: "no children" leaves the field as it is.
  if (fields.childrenAges !== undefined && fields.childrenAges.length > 0) values.children_ages = fields.childrenAges;
  if (fields.pickupCity !== undefined) values.departure_city = fields.pickupCity;
  if (fields.room !== undefined) values.room_type = fields.room;
  return values;
}

/**
 * The stage the turn reached, each when its details are complete (Plan 1's ruling of 2026-11-15): an offer or a total
 * told makes Quote sent, words sent once the trip is known Contacted. A hold made Booking requested with the booking.
 */
async function stageReached(
  tx: OrgTx,
  input: NaturalActInput,
  leadId: string,
  turn: { sentWords: boolean; told: readonly ToldTotal[] },
): Promise<"quote_sent" | "contacted" | null> {
  const { staged } = input;
  if (stagedOf(staged, "offer_booking") !== null || turn.told.length > 0) return "quote_sent";
  if (!turn.sentWords) return null;
  const tripNamed =
    stagedOf(staged, "update_lead")?.fields.packageId !== undefined || stagedOf(staged, "send_brochure") !== null;
  if (tripNamed) return "contacted";
  const lead = await tx.lead.findUnique({ where: { id: leadId }, select: { destinationId: true } });
  return lead?.destinationId == null ? null : "contacted";
}

/** Writes the turn on the lead. Returns codes of what changed. */
export async function writeTurnOnLead(
  tx: OrgTx,
  deps: NaturalActDeps,
  input: NaturalActInput,
  lead: { id: string },
  chat: ChatPerson,
  turn: { sentWords: boolean; told: readonly ToldTotal[] },
): Promise<string[]> {
  const { organizationId, staged, now } = input;
  const actor = systemActor(organizationId);
  const codes: string[] = [];
  const update = stagedOf(staged, "update_lead");
  if (update !== null) {
    const values = tripValuesOf(update.fields, input);
    const fields = await writeAiTripFields(tx, { organizationId, leadId: lead.id, values, today: input.today });
    codes.push(...fields.map((field) => `lead:${field}`));
    const name = update.fields.name?.trim() ?? "";
    // Only a WhatsApp stand-in or profile name is replaced; a name a person typed stays.
    if (chat.personId !== null && usableName(name, chat.phoneE164)) {
      const person = { personId: chat.personId, profileName: chat.profileName, phoneE164: chat.phoneE164 };
      if (await renameWhatsAppPerson(tx, actor, { ...person, leadId: lead.id, name })) codes.push("name");
    }
  }
  const notes = [...(update?.notes ?? []), stagedOf(staged, "add_note")?.text ?? null].filter(isText);
  for (const note of notes) if (await addAiLeadNote(tx, actor, lead.id, note)) codes.push("note");
  codes.push(...(await addTurnTasks(tx, deps, input, lead.id)));
  const close = stagedOf(staged, "suggest_close");
  if (close !== null) {
    const suggestion = { kind: close.kind, lostReason: null, reason: close.reason };
    const conversationId = input.conversationId;
    if (await suggestStage(tx, { organizationId, leadId: lead.id, conversationId, ...suggestion, now })) {
      codes.push(`suggest:${close.kind}`);
    }
  }
  const stage = await stageReached(tx, input, lead.id, turn);
  if (stage !== null && (await advanceLeadStage(tx, actor, { leadId: lead.id, stage, byAi: true }, now))) {
    codes.push(`stage:${stage}`);
  }
  return codes;
}
