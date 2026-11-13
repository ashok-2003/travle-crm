// The lite turn's first transaction: every gate it must pass, re-read each turn (the AI module, the owner's switch and
// the lite switch, the chat's own checks, the agent's setup, the month's limit), then all that Understand, decide and
// Write read: the chat's lines, its facts with a person's lead values put first, the lead, the trips on offer, the
// bookings, and the agency's own words.
import { indianTravelPlaces, type AgencyAnswers, type AgentBasics, type LiteFacts } from "@travel-crm/contracts/ai";
import type { LeadStage } from "@travel-crm/contracts/crm";
import type { OrgTx } from "@travel-crm/db";
import { openLeadOfChat } from "../../crm/index.js";
import { organizationTimeZone } from "../../identity/index.js";
import { adPackageOf } from "../../inbox/index.js";
import { calendarDateIn, type CalendarDate } from "../../kernel/index.js";
import { getOrganizationProfile } from "../../profile/index.js";
import { sellablePackages } from "../../quotes/index.js";
import type { ChatFacts as ChatRow } from "../agent-effects.js";
import { agencyAnswersOf, agentBasicsOf } from "../agency-answers.js";
import { agentSetupOf } from "../agent-setup.js";
import { autopilotOf, type AutopilotRow } from "../autopilot.js";
import { AI_TOKEN_PREFIX, mayWrite } from "../may-write.js";
import { RECENT_SENT } from "../repeats.js";
import { aiEnabled } from "../settings.js";
import { MONTHLY_AI_LIMIT, usedThisMonth } from "../usage.js";
import { usableName } from "./decide/stage.js";
import type { DecideInput } from "./decide/decide.js";
import { readLiteFacts } from "./merge.js";
import { bookingPartOf, leadPartOf, packageIndexOf } from "./prepare-lead.js";
import type {
  ContextMessage,
  LeadCardFacts,
  LiteDependencies,
  LiteOutcome,
  LiteTurnInput,
  PackageIndexEntry,
  TimelineLine,
} from "./types.js";

const LAST_MESSAGES = 20;

export interface LitePrepared {
  settings: AutopilotRow;
  chat: ChatRow;
  timeZone: string;
  today: CalendarDate;
  facts: LiteFacts;
  summary: string;
  leadId: string | null;
  leadStage: LeadStage | null;
  card: LeadCardFacts | null;
  timeline: TimelineLine[];
  /** The chat's last 20 messages, oldest first, reactions left out. */
  messages: ContextMessage[];
  /** The customer's messages after our last one: what this turn answers. */
  burst: ContextMessage[];
  /** The chat's last messages sent, newest first: a reply that says one again is not sent. */
  sent: string[];
  index: PackageIndexEntry[];
  places: DecideInput["places"];
  /** A stored "enthusiastic" tone reads as friendly: the lite agent has two. */
  basics: AgentBasics & { tone: "friendly" | "professional" };
  answers: AgencyAnswers;
  adPackageId: string | null;
  openBooking: DecideInput["openBooking"];
  hasBooking: boolean;
  mayBePayment: boolean;
  nameUsable: boolean;
  supplierStateCode: string | null;
}

/** The chat's lines as the prompts read them: who wrote each (the customer, this AI, or the team) and what. */
async function chatLines(tx: OrgTx, conversationId: string) {
  const rows = await tx.whatsappMessage.findMany({
    where: { conversationId, kind: { not: "reaction" } },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: LAST_MESSAGES,
    select: { id: true, direction: true, kind: true, body: true, caption: true, clientToken: true, occurredAt: true },
  });
  const messages: ContextMessage[] = rows.reverse().map((row) => ({
    id: row.id,
    from:
      row.direction === "in" ? "customer" : (row.clientToken?.startsWith(AI_TOKEN_PREFIX) ?? false) ? "you" : "team",
    at: row.occurredAt,
    kind: row.kind,
    text: row.body ?? row.caption ?? "",
  }));
  const ours = messages.map((message) => message.from !== "customer").lastIndexOf(true);
  const sent = await tx.whatsappMessage.findMany({
    where: { conversationId, direction: "out", body: { not: null } },
    orderBy: { occurredAt: "desc" },
    take: RECENT_SENT,
    select: { body: true },
  });
  return { messages, burst: messages.slice(ours + 1), sent: sent.map((row) => row.body ?? "") };
}

/** The places the reply check knows (the agency's destinations and India's travel places), and those it doesn't sell. */
export async function placesOf(tx: OrgTx, index: PackageIndexEntry[]): Promise<DecideInput["places"]> {
  const destinations = await tx.destination.findMany({ select: { id: true, name: true } });
  const sold = new Set(index.map((entry) => entry.destinationId));
  return {
    known: [...new Set([...destinations.map((one) => one.name), ...indianTravelPlaces])],
    unsold: destinations.filter((one) => !sold.has(one.id)).map((one) => one.name),
  };
}

/** The facts as the turn starts from them: a package no longer for sale let go, and a usable name taken as theirs. */
function startingFacts(facts: LiteFacts, index: PackageIndexEntry[], name: string | null): LiteFacts {
  const sellable = facts.packageId === null || index.some((entry) => entry.id === facts.packageId);
  const kept = sellable ? facts : { ...facts, packageId: null, departureId: null, quoted: null };
  return kept.name === null && name !== null ? { ...kept, name } : kept;
}

/** Either why the turn ends now (the outcome), or everything it needs. */
export async function prepareLiteTurn(
  deps: LiteDependencies,
  input: LiteTurnInput,
  now: Date,
): Promise<LitePrepared | LiteOutcome> {
  const { organizationId } = input;
  return deps.db.forOrg(organizationId, async (tx) => {
    const settings = await autopilotOf(tx);
    // The inbox hands a lite agency's chats on with the AI module off too (automationCouldAct): the turn refuses them.
    if (!(await aiEnabled(tx)) || !settings.autopilot || !settings.lite) return "off";
    const chat = await tx.whatsappConversation.findUnique({
      where: { id: input.conversationId },
      select: {
        id: true,
        personId: true,
        lastInboundAt: true,
        state: true,
        hidden: true,
        phoneE164: true,
        profileName: true,
      },
    });
    if (chat === null) return "nothing";
    const row: ChatRow = {
      id: chat.id,
      personId: chat.personId,
      lastInboundAt: chat.lastInboundAt,
      state: chat.state,
      hidden: chat.hidden,
    };
    const blocked = await mayWrite(tx, row, settings, input.kind, now);
    if (blocked !== null) return blocked;
    const timeZone = await organizationTimeZone(tx, organizationId);
    const today = calendarDateIn(now, timeZone);
    // Read once for the turn: the setup's check and the index both take this list.
    const sellable = await sellablePackages(tx, organizationId, today);
    if (!(await agentSetupOf(tx, organizationId, today, sellable)).ready) return "not_ready";
    // Each model call reserves its own call later; here only a month already full ends the turn.
    if ((await usedThisMonth(tx, now, timeZone)) >= MONTHLY_AI_LIMIT) return "limit";
    const lines = await chatLines(tx, chat.id);
    if (lines.messages.length === 0) return "nothing";
    const index = await packageIndexOf(tx, sellable, today, now);
    const personName =
      chat.personId === null
        ? null
        : ((await tx.person.findFirst({ where: { id: chat.personId }, select: { name: true } }))?.name ?? null);
    // K1: the name they go by, so it is never asked; a WhatsApp stand-in or a word like "Travel" is no name.
    const name = [personName, chat.profileName].find((one) => usableName(one, chat.phoneE164))?.trim() ?? null;
    const lead = await openLeadOfChat(tx, chat.personId);
    const leadPart = await leadPartOf(tx, lead?.id ?? null, {
      facts: startingFacts(await readLiteFacts(tx, chat.id), index, name),
      name,
      index,
    });
    const adPackageId = await adPackageOf(tx, chat.id);
    const basics = await agentBasicsOf(tx);
    return {
      settings,
      chat: row,
      timeZone,
      today,
      ...lines,
      ...leadPart,
      summary:
        (await tx.aiChat.findFirst({ where: { conversationId: chat.id }, select: { summary: true } }))?.summary ?? "",
      index,
      places: await placesOf(tx, index),
      basics: { agentName: basics.agentName, tone: basics.tone === "professional" ? "professional" : "friendly" },
      answers: await agencyAnswersOf(tx),
      adPackageId: index.some((entry) => entry.id === adPackageId) ? adPackageId : null,
      ...(await bookingPartOf(tx, chat, leadPart.leadId, { now, today })),
      nameUsable: name !== null,
      supplierStateCode: (await getOrganizationProfile(tx, organizationId))?.gstStateCode ?? null,
    };
  });
}
