// A new WhatsApp lead that arrives filled in (release ai2a, feature 3). The scoring call already reads the chat; with the
// agency's switch on it also reads the customer's trip out of their first ten messages, and this writes it onto the lead's own
// fields (so lists and assignment can use it), only where the lead holds nothing, never over a person's value, and flags each as
// "suggested" with the customer's own words. The violet ends by itself once the lead's value no longer equals the suggestion, so
// crm never has to call this module. A person confirms (keeps them) or dismisses (clears what is still the AI's). Runs as the
// system, audited with field names only.
import type { FillPath } from "@travel-crm/contracts/ai";
import { suggestedLeadFields, type SuggestedLeadField, type TripAnswer } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../../audit/index.js";
import { searchDestinations } from "../../catalog/index.js";
import { clearTripFields, fillTripGaps, tripFieldValues, type GapField, type TripGaps } from "../../crm/index.js";
import type { MemberAccess } from "../../identity/index.js";
import { DomainError, systemActor } from "../../kernel/index.js";
import { resolveLead } from "./resolve.js";
import { valueHash } from "./values.js";

const FIELD_OF: Partial<Record<FillPath, GapField>> = {
  "trip.destination": "destination",
  "trip.when": "when",
  "trip.adults": "adults",
  "trip.childrenAges": "children_ages",
  "trip.budget": "budget",
  "trip.departureCity": "departure_city",
  "trip.tripType": "trip_type",
  "trip.hotelCategory": "hotel_category",
  "trip.food": "food",
  "trip.roomType": "room_type",
};
const PATH_OF = Object.fromEntries(Object.entries(FIELD_OF).map(([path, field]) => [field, path])) as Record<
  GapField,
  FillPath
>;

/** The customer's first ten messages are read, no more. */
export const FILL_MESSAGES = 10;

/** What a lead needs before the AI stops asking: where, when, who and how much. */
export async function leadIsComplete(tx: OrgTx, leadId: string): Promise<boolean> {
  const values = await tripFieldValues(tx, leadId);
  return values !== null && [values.destination, values.when, values.adults, values.budget].every((v) => v !== null);
}

/**
 * Writes what the chat says into the lead's empty fields and flags them as suggested. Returns the field names written. The
 * lead's own value is never replaced, and a field a person dismissed is not suggested again.
 */
export async function fillLeadFromChat(
  tx: OrgTx,
  input: {
    organizationId: string;
    leadId: string;
    trip: TripAnswer;
    customerMessageIds: readonly string[];
    today: string;
  },
): Promise<GapField[]> {
  const resolved = await resolveLead(input.trip, "lead_edit", {
    today: input.today,
    from: "chat",
    matchDestination: async (name) => {
      const wanted = name.trim().toLowerCase();
      const found = await searchDestinations(tx, { query: name, limit: 5 });
      return (
        found.find((one) => one.name.toLowerCase() === wanted) ??
        found.find((one) => one.name.toLowerCase().includes(wanted) || wanted.includes(one.name.toLowerCase())) ??
        null
      );
    },
  });
  const dismissed = await tx.leadAiField.findMany({
    where: { leadId: input.leadId, state: "dismissed" },
    select: { field: true },
  });
  const gaps: TripGaps = {};
  const by = new Map(resolved.fields.map((field) => [field.path, field]));
  const value = (path: FillPath) => by.get(path)?.value as never;
  // A destination the agency doesn't list is not added by the AI on its own: only an existing one is written.
  const destination = by.get("trip.destination")?.value as { kind: string; destinationId?: string } | undefined;
  if (destination?.kind === "existing" && destination.destinationId !== undefined)
    gaps.destinationId = destination.destinationId;
  if (by.has("trip.when")) gaps.when = value("trip.when");
  if (by.has("trip.adults")) gaps.adults = value("trip.adults");
  if (by.has("trip.childrenAges")) gaps.childrenAges = value("trip.childrenAges");
  if (by.has("trip.budget")) gaps.budget = value("trip.budget");
  if (by.has("trip.departureCity")) gaps.departureCity = value("trip.departureCity");
  if (by.has("trip.tripType")) gaps.tripType = value("trip.tripType");
  if (by.has("trip.hotelCategory")) gaps.hotelCategory = value("trip.hotelCategory");
  if (by.has("trip.food")) gaps.food = value("trip.food");
  if (by.has("trip.roomType")) gaps.roomType = value("trip.roomType");
  const written = await fillTripGaps(tx, input.leadId, gaps, new Set(dismissed.map((row) => row.field as GapField)));
  for (const field of written) {
    const path = PATH_OF[field];
    const proposed =
      path === "trip.destination" ? { kind: "existing", destinationId: gaps.destinationId } : by.get(path)?.value;
    const row = {
      state: "suggested",
      valueHash: valueHash(path, proposed),
      excerpt: (by.get(path)?.excerpt ?? "").slice(0, 200),
      messageIds: [...input.customerMessageIds],
    };
    await tx.leadAiField.upsert({
      where: { organizationId_leadId_field: { organizationId: input.organizationId, leadId: input.leadId, field } },
      create: { leadId: input.leadId, field, ...row },
      update: row,
    });
  }
  if (written.length > 0) {
    await recordAudit(tx, systemActor(input.organizationId), {
      action: "ai.lead-filled",
      entityType: "lead",
      entityId: input.leadId,
      after: { fields: written },
    });
  }
  return written;
}

export interface SuggestedField {
  field: SuggestedLeadField;
  path: FillPath;
  value: unknown;
  excerpt: string;
}

/** The suggestions on a lead that still hold what the AI wrote: a field a person has changed since is theirs now. */
export async function suggestedFieldsOf(tx: OrgTx, leadId: string): Promise<SuggestedField[]> {
  const rows = await tx.leadAiField.findMany({ where: { leadId, state: "suggested" }, orderBy: { createdAt: "asc" } });
  if (rows.length === 0) return [];
  const now = await tripFieldValues(tx, leadId);
  if (now === null) return [];
  return rows.flatMap((row) => {
    const field = row.field as GapField;
    const path = PATH_OF[field];
    const current = now[field];
    if (current === null || !suggestedLeadFields.includes(field) || valueHash(path, current) !== row.valueHash)
      return [];
    return [{ field, path, value: current, excerpt: row.excerpt }];
  });
}

/**
 * Confirms the suggestions (the AI's values stay, as the person's) or dismisses them (the values still the AI's are cleared,
 * and are not suggested again). The lead must be one the member may work; a lead with nothing suggested is "not found".
 */
export async function decideSuggestions(
  tx: OrgTx,
  access: MemberAccess,
  leadId: string,
  decision: "confirm" | "dismiss",
): Promise<void> {
  const open = await suggestedFieldsOf(tx, leadId);
  if (open.length === 0) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  const fields = open.map((one) => one.field);
  if (decision === "dismiss") await clearTripFields(tx, leadId, fields);
  // Every suggestion row of the lead is decided: one a person changed since is theirs, so it leaves the suggested list too.
  await tx.leadAiField.updateMany({
    where: { leadId, state: "suggested" },
    data: { state: decision === "confirm" ? "confirmed" : "dismissed" },
  });
  const about = { entityType: "lead", entityId: leadId, after: { fields } };
  if (decision === "confirm") await recordAudit(tx, access, { action: "ai.lead-fields-confirmed", ...about });
  else await recordAudit(tx, access, { action: "ai.lead-fields-dismissed", ...about });
}
