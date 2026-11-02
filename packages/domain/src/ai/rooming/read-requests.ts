// Rooming requests read by the AI (release ai3): it reads each traveller's room note, the notes on their booking's lead and
// what the AI kept from the chat, and proposes which of 7a's fixed room requests (single room, ground floor, near the group) a
// traveller asked for, with the words it read that from. It proposes, never saves: staff tick and apply, through the rooming
// list's own update (departures' setRoomRequests, audited with the fill). Unknown stays "none". Three short transactions around
// the model, as Suggest reply has: the checks and one monthly call, the model, then the fill's row (or the call given back).
import { roomRequests, type RoomRequest } from "@travel-crm/contracts/departures";
import {
  type ReadRoomRequestsInput,
  type RoomRequestsProposal,
  type RoomRequestSuggestion,
} from "@travel-crm/contracts/ai";
import type { Database, OrgTx } from "@travel-crm/db";
import type { AiModel } from "@travel-crm/integrations/ai";
import { findDeparture, nameOf, rosterOf, type RosterTraveller } from "../../departures/index.js";
import { organizationTimeZone, type MemberAccess } from "../../identity/index.js";
import { jsonObjectIn } from "../fill/json.js";
import { refuse, modelRefusal } from "../refusals.js";
import { aiEnabled } from "../settings.js";
import { MONTHLY_AI_LIMIT, recordTokens, releaseAiCall, reserveAiCall, usedThisMonth } from "../usage.js";
import { requestHash } from "./applied.js";
import { roomRequestsPrompt, type RoomingBooking } from "./prompt.js";

/** The most travellers read in one call, and the notes kept for each booking's lead. */
const TRAVELLERS_MAX = 80;
const NOTES_PER_LEAD = 3;
const NOTE_CHARS = 500;
const EXCERPT_CHARS = 200;

const proposable = new Set<string>(roomRequests.filter((request) => request !== "none"));

/** The model's `requests` as plain items, whatever else it wrote; anything that is not an object with a traveller and a request is dropped. */
function requestsIn(json: unknown): { traveller: string; request: string; excerpt: string }[] {
  const list = (json as { requests?: unknown } | null)?.requests;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item: unknown) => {
    const { traveller, request, excerpt } = (item ?? {}) as Record<string, unknown>;
    return typeof traveller === "string" && typeof request === "string"
      ? [{ traveller, request, excerpt: typeof excerpt === "string" ? excerpt : "" }]
      : [];
  });
}

interface Prepared {
  timeZone: string;
  bookings: RoomingBooking[];
  /** The prompt's traveller ref -> the traveller and the words it may quote from (their booking's). */
  byRef: Map<string, { traveller: RosterTraveller; corpus: string }>;
}

const squash = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

/** The notes on each lead the member may see, newest first: what staff wrote and what the AI kept. */
async function notesOf(tx: OrgTx, access: MemberAccess, leadIds: readonly string[]) {
  const scope = access.permissions.scopeOf("leads:view");
  const found = new Map<string, { staff: string[]; ai: string[] }>();
  if (scope === null || leadIds.length === 0) return found;
  const rows = await tx.leadNote.findMany({
    where: {
      leadId: { in: [...leadIds] },
      ...(scope === "all" ? {} : { lead: { is: { ownerUserId: access.userId } } }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 400,
    select: { leadId: true, body: true, byAi: true, createdBy: true },
  });
  for (const row of rows) {
    if (!row.byAi && row.createdBy === null) continue;
    const entry = found.get(row.leadId) ?? { staff: [], ai: [] };
    const list = row.byAi ? entry.ai : entry.staff;
    if (list.length < NOTES_PER_LEAD) list.push(row.body.trim().slice(0, NOTE_CHARS));
    found.set(row.leadId, entry);
  }
  return found;
}

async function prepare(tx: OrgTx, access: MemberAccess, input: ReadRoomRequestsInput, now: Date): Promise<Prepared> {
  if (!(await aiEnabled(tx))) {
    throw refuse("AI_OFF", "The AI is off for this agency: an Owner or Admin turns it on in Settings, AI");
  }
  const departure = await findDeparture(tx, input.departureId);
  const timeZone = await organizationTimeZone(tx, access.organizationId);
  // Only a traveller with no request yet can be proposed one: what staff or the traveller chose is left alone.
  const roster = (await rosterOf(tx, departure.id)).filter((traveller) => traveller.roomRequest === "none");
  const bookingRows = await tx.booking.findMany({
    where: { id: { in: [...new Set(roster.map((traveller) => traveller.bookingId))] } },
    select: { id: true, leadId: true },
  });
  const leadOf = new Map(bookingRows.map((row) => [row.id, row.leadId]));
  const notes = await notesOf(tx, access, [...new Set(bookingRows.map((row) => row.leadId))]);

  const bookings: RoomingBooking[] = [];
  const byRef = new Map<string, { traveller: RosterTraveller; corpus: string }>();
  let travellers = 0;
  const grouped = Map.groupBy(roster, (traveller) => traveller.bookingId);
  for (const [bookingId, people] of grouped) {
    if (travellers >= TRAVELLERS_MAX) break;
    const lead = notes.get(leadOf.get(bookingId) ?? "") ?? { staff: [], ai: [] };
    const hasWords = people.some((one) => one.roomNote.trim() !== "") || lead.staff.length + lead.ai.length > 0;
    if (!hasWords) continue;
    const ref = `B${String(bookings.length + 1)}`;
    const booking: RoomingBooking = {
      ref,
      customerName: people[0]?.customerName ?? "",
      travellers: people.map((one, index) => ({
        ref: `${ref}T${String(index + 1)}`,
        name: nameOf(one),
        note: one.roomNote.trim(),
      })),
      staffNotes: lead.staff,
      aiNotes: lead.ai,
    };
    const corpus = squash([...people.map((one) => one.roomNote), ...lead.staff, ...lead.ai].join(" \n "));
    people.forEach((one, index) => byRef.set(`${ref}T${String(index + 1)}`, { traveller: one, corpus }));
    bookings.push(booking);
    travellers += people.length;
  }
  if (bookings.length === 0) {
    throw refuse("ROOMING_NOTHING_TO_READ", "No traveller has a note to read about their room", "VALIDATION");
  }
  // One monthly call, taken before the model is asked and given back when it doesn't answer.
  if (!(await reserveAiCall(tx, now, timeZone))) {
    throw refuse("AI_MONTH_LIMIT", "This agency has used this month's AI suggestions", "LIMIT_REACHED");
  }
  return { timeZone, bookings, byRef };
}

/** The model's answer as suggestions: only known travellers, only the three requests, only words that were in the notes. */
function suggestionsOf(text: string, byRef: Prepared["byRef"]): RoomRequestSuggestion[] {
  const seen = new Set<string>();
  const suggestions: RoomRequestSuggestion[] = [];
  for (const item of requestsIn(jsonObjectIn(text))) {
    const found = byRef.get(item.traveller.trim().toUpperCase());
    const excerpt = item.excerpt.trim().slice(0, EXCERPT_CHARS);
    if (found === undefined || seen.has(found.traveller.id)) continue;
    if (!proposable.has(item.request) || excerpt === "" || !found.corpus.includes(squash(excerpt))) continue;
    seen.add(found.traveller.id);
    suggestions.push({
      travellerId: found.traveller.id,
      name: nameOf(found.traveller),
      bookingNumber: found.traveller.bookingNumber,
      current: "none",
      proposed: item.request as RoomRequest,
      excerpt,
    });
  }
  return suggestions;
}

/**
 * Reads a departure's travellers' notes. Refused when the AI is off, the departure is not found, no traveller has a note to
 * read, the month's limit is used, or the AI doesn't answer (the call is then given back). Permissions and the plan's modules
 * are the router's.
 */
export async function readRoomRequests(
  { db, model }: { db: Database; model: AiModel },
  access: MemberAccess,
  input: ReadRoomRequestsInput,
  now: Date,
): Promise<RoomRequestsProposal> {
  const { organizationId } = access;
  if (!model.configured) throw refuse("AI_NOT_READY", "The AI isn't set up on this server yet");
  const prepared = await db.forOrg(organizationId, (tx) => prepare(tx, access, input, now));
  const giveBack = () => db.forOrg(organizationId, (tx) => releaseAiCall(tx, now, prepared.timeZone));
  const result = await model.complete({
    feature: "read_requests",
    messages: roomRequestsPrompt(prepared.bookings),
    json: true,
    maxTokens: 1500,
    // Opaque: the agency's id, never a person's.
    user: organizationId,
  });
  if (!result.ok) {
    await giveBack();
    throw modelRefusal(result.reason);
  }
  const suggestions = suggestionsOf(result.text, prepared.byRef);
  return db.forOrg(organizationId, async (tx) => {
    // Nothing found is not a call.
    if (suggestions.length === 0) await releaseAiCall(tx, now, prepared.timeZone);
    else await recordTokens(tx, now, prepared.timeZone, { input: result.inputTokens, output: result.outputTokens });
    const row =
      suggestions.length === 0
        ? null
        : await tx.aiFill.create({
            data: {
              target: "room_requests",
              subjectType: "departure",
              subjectId: input.departureId,
              requestedBy: access.userId,
              inputKind: "text",
              model: result.model,
              proposalHash: requestHash(suggestions.map((one) => `${one.travellerId}:${one.proposed}`).join(",")),
              fields: suggestions.map((one) => one.travellerId),
              fieldHashes: Object.fromEntries(suggestions.map((one) => [one.travellerId, requestHash(one.proposed)])),
            },
            select: { id: true },
          });
    return {
      fillId: row?.id ?? null,
      suggestions,
      usedThisMonth: await usedThisMonth(tx, now, prepared.timeZone),
      monthlyLimit: MONTHLY_AI_LIMIT,
    };
  });
}
