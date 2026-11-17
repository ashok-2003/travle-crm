// The natural turn's live reads (plan 2, Task 4), in one transaction: lite's gates, with the day's cap and the month's
// limit handed back as data so the turn can hand over at them (ruling 5), then the chat's lines, the trips on sale as
// the model reads them, the open lead, the facts the chat keeps, the booking ahead, the ad it came from and the agency's
// own words. Identity, whose calls run their own queries, names the team after the transaction.
import { liteFacts, naturalFacts, type AgencyAnswers, type NaturalFacts } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { openLeadOfChat } from "../../crm/index.js";
import type { MemberContact } from "../../identity/index.js";
import { adPackageOf } from "../../inbox/index.js";
import type { CalendarDate } from "../../kernel/index.js";
import { agencyPaymentDetailsOf, getOrganizationProfile, paymentDetailsReady } from "../../profile/index.js";
import { agencyAnswersOf, agentBasicsOf } from "../agency-answers.js";
import { PROOF_KINDS } from "../booking.js";
import { factsForLead } from "../lite/merge.js";
import { turnGates } from "../lite/turn-gates.js";
import type { TypedFields } from "../lite/typed-lock.js";
import type { LiteDependencies, LiteOutcome, LiteTurnInput } from "../lite/types.js";
import { chatRowOf, type ChatRow } from "../may-write.js";
import { mayBePayment } from "../payment-likely.js";
import { firstNameOf, naturalChatLines, withTeamNames } from "./chat-lines.js";
import type { NaturalContextInput } from "./context/build.js";
import { newLinesOf } from "./context/chat-turns.js";
import { bookingAheadOf, cameFromOf, type BookingAhead } from "./prepare-chat.js";
import { leadReadOf, type TeamNoteRead } from "./prepare-lead.js";
import type { AgentVoice } from "./prompt.js";
import { tripSheetsOf } from "./trips/trip-sheets.js";
import type { NaturalChatLine, NaturalLeadView, TripSheet } from "./types.js";

export interface NaturalPrepared {
  chat: ChatRow & { phoneE164: string; profileName: string | null };
  timeZone: string;
  today: CalendarDate;
  sheets: TripSheet[];
  answers: AgencyAnswers;
  voice: AgentVoice;
  facts: NaturalFacts;
  lead: NaturalLeadView;
  leadId: string | null;
  /** The lead's trip values a person set: the turn never changes them. */
  typed: TypedFields;
  /** The chat's newest 60 lines, oldest first, the team named; new photos and files flagged when a payment is likely. */
  lines: NaturalChatLine[];
  /** The trip of the ad the chat came from, when it is on sale. */
  adPackageId: string | null;
  cameFrom: NaturalContextInput["cameFrom"];
  booking: BookingAhead | null;
  /** The agency's payment details are set: a booking can be taken. */
  paymentReady: boolean;
  lastInboundAt: Date;
  supplierStateCode: string | null;
  /** Ruling 5: at `repliesToday >= dayCap`, or a full month, the turn hands over without a model call. */
  repliesToday: number;
  dayCap: number;
  monthFull: boolean;
}

/** What the transaction read: everything but the names identity gives after it, and the agency's own name. */
interface Read {
  prepared: Omit<NaturalPrepared, "voice" | "lead"> & { lead: Omit<NaturalLeadView, "teamNotes"> };
  agentName: string;
  tone: AgentVoice["tone"];
  senders: ReadonlyMap<string, string>;
  notes: TeamNoteRead[];
}

const MOST_SENT_FILES = 150;
const MOST_SENT_TRIPS = 50;

/**
 * The facts the turn starts from (spec 10). A natural row's are kept; when their lead is no longer the chat's open one,
 * the trip's facts start afresh as lite's `factsForLead` does, keeping when the last turn ran, which tells new lines
 * from old. Any other row (lite's, an older agent's, none) starts afresh with the files lite sent for this lead, and a
 * trip counts as sent when one of its files went (ruling 4), so no brochure goes twice.
 */
export function naturalFactsFrom(stored: unknown, leadId: string | null, sheets: readonly TripSheet[]): NaturalFacts {
  const natural = naturalFacts.safeParse(stored);
  if (natural.success) {
    const facts = natural.data;
    if (facts.leadId === null || facts.leadId === leadId) return { ...facts, leadId };
    return naturalFacts.parse({ agent: "natural", leadId, lastTurnAt: facts.lastTurnAt });
  }
  const lite = liteFacts.safeParse(stored);
  const sentFileIds = lite.success ? factsForLead(lite.data, leadId).sentFileIds.slice(-MOST_SENT_FILES) : [];
  const sent = new Set(sentFileIds);
  const sentTripIds = sheets
    .filter((sheet) => sheet.fileIds.some((id) => sent.has(id)))
    .map((sheet) => sheet.packageId);
  return naturalFacts.parse({
    agent: "natural",
    leadId,
    sentFileIds,
    sentTripIds: sentTripIds.slice(-MOST_SENT_TRIPS),
  });
}

/** The new photos and files flagged when a payment is likely in the chat (`mayBePayment`); one read for them all. */
async function withPaymentFlags(
  tx: OrgTx,
  lines: NaturalChatLine[],
  facts: NaturalFacts,
  input: { conversationId: string; leadId: string | null; at: Date },
): Promise<NaturalChatLine[]> {
  const lastTurnAt = facts.lastTurnAt === null ? null : new Date(facts.lastTurnAt);
  const media = new Set(newLinesOf(lines, lastTurnAt).filter((line) => PROOF_KINDS.includes(line.kind)));
  if (media.size === 0 || !(await mayBePayment(tx, input))) return lines;
  return lines.map((line) => (media.has(line) ? { ...line, mayBePayment: true } : line));
}

async function readTurn(tx: OrgTx, input: LiteTurnInput, now: Date): Promise<Read | LiteOutcome> {
  const { organizationId } = input;
  const passed = await turnGates(tx, input, now, { limits: false });
  if (typeof passed === "string") return passed;
  const { chat, timeZone, today, sellable, limits } = passed;
  const read = await naturalChatLines(tx, chat.id);
  if (read.lines.length === 0) return "nothing";
  const sheets = await tripSheetsOf(tx, sellable, today, now);
  const leadId = (await openLeadOfChat(tx, chat.personId))?.id ?? null;
  const state = await tx.aiChat.findFirst({
    where: { conversationId: chat.id },
    select: { facts: true, summary: true },
  });
  const facts = naturalFactsFrom(state?.facts, leadId, sheets);
  const lines = await withPaymentFlags(tx, read.lines, facts, { conversationId: chat.id, leadId, at: now });
  const lead = await leadReadOf(tx, chat, leadId, { sheets, facts, summary: state?.summary ?? "" });
  const ad = await adPackageOf(tx, chat.id);
  const adPackageId = sheets.some((sheet) => sheet.packageId === ad) ? ad : null;
  const basics = await agentBasicsOf(tx);
  const payment = await agencyPaymentDetailsOf(tx, organizationId);
  return {
    prepared: {
      chat: { ...chatRowOf(chat), phoneE164: chat.phoneE164, profileName: chat.profileName },
      timeZone,
      today,
      sheets,
      answers: await agencyAnswersOf(tx),
      facts,
      lead: lead.view,
      leadId,
      typed: lead.typed,
      lines,
      adPackageId,
      cameFrom: await cameFromOf(tx, chat.id, adPackageId),
      booking: await bookingAheadOf(tx, chat, today),
      paymentReady: paymentDetailsReady(payment),
      // The window's gate passed, so the customer has written.
      lastInboundAt: chat.lastInboundAt ?? now,
      supplierStateCode: (await getOrganizationProfile(tx, organizationId))?.gstStateCode ?? null,
      ...limits,
    },
    agentName: basics.agentName,
    // A stored "enthusiastic" reads as friendly: the agent has two tones.
    tone: basics.tone === "professional" ? "professional" : "friendly",
    senders: read.senders,
    notes: lead.notes,
  };
}

/** Either why the turn ends now (lite's outcome), or everything the natural turn reads. */
export async function prepareNaturalTurn(
  deps: LiteDependencies,
  input: LiteTurnInput,
  now: Date,
): Promise<NaturalPrepared | LiteOutcome> {
  const { organizationId } = input;
  const read = await deps.db.forOrg(organizationId, (tx) => readTurn(tx, input, now));
  if (typeof read === "string") return read;
  const userIds = new Set([...read.senders.values(), ...read.notes.map((note) => note.userId)]);
  const contacts: MemberContact[] =
    deps.identity === undefined || userIds.size === 0
      ? []
      : await deps.identity.memberContacts(organizationId, [...userIds]);
  const { prepared } = read;
  const teamNotes = read.notes.map((note) => ({
    at: note.at,
    // Someone who has left the agency is still the team.
    by: firstNameOf(contacts, note.userId) ?? "Team",
    text: note.text,
  }));
  return {
    ...prepared,
    voice: { agentName: read.agentName, agencyName: await deps.agencyName(organizationId), tone: read.tone },
    lead: { ...prepared.lead, teamNotes },
    lines: withTeamNames(prepared.lines, read.senders, contacts),
  };
}
