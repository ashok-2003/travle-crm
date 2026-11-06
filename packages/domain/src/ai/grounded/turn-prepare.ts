// The turn's first transaction: every check the old agent runs before it writes (the same ones, in the same order), then
// what the steps after it need: the chat's facts and lines, the keys the read step is given, the agency's own words.
import { chatFacts, type ChatFacts } from "@travel-crm/contracts/ai";
import type { AiMessage } from "@travel-crm/integrations/ai";
import { organizationTimeZone } from "../../identity/index.js";
import { calendarDateIn, type CalendarDate } from "../../kernel/index.js";
import { getOrganizationProfile } from "../../profile/index.js";
import { sellablePackages } from "../../quotes/index.js";
import { chatHistory, knowledgePack, leadFactsFor } from "../agent-context.js";
import type { AgentVoice } from "../agent-prompt.js";
import type { ChatFacts as ChatRow } from "../agent-effects.js";
import { autopilotOf, type AutopilotRow } from "../autopilot.js";
import { calendarText, dateChecks } from "../calendar.js";
import { chatVoiceOf } from "../chat-voice.js";
import { activeLessons } from "../learning-store.js";
import { mayWrite } from "../may-write.js";
import { RECENT_SENT } from "../repeats.js";
import { aiEnabled } from "../settings.js";
import { MONTHLY_AI_LIMIT, usedThisMonth } from "../usage.js";
import { naturalIn } from "../voice.js";
import { readFacts } from "./facts.js";
import { aboutCustomer } from "./prompt.js";
import type { ChatLine, ReadKeys } from "./read-keys.js";
import type { GroundedDependencies, TurnInput } from "./turn-types.js";

export interface Prepared {
  settings: AutopilotRow;
  chat: ChatRow;
  messages: AiMessage[];
  /** The chat's last messages sent, newest first: a reply that says one again is not sent. */
  sent: string[];
  transcript: ChatLine[];
  facts: ChatFacts;
  timeZone: string;
  today: CalendarDate;
  keys: ReadKeys;
  /** The agency's destination names: the places the check knows. */
  destinationNames: string[];
  knowledge: string;
  learnings: string[];
  voice: AgentVoice | null;
  natural: boolean;
  instructions: string;
  factsWords: string;
  calendar: string;
  dateChecks: string[];
  supplierStateCode: string | null;
}

/** The keys: D<n> for each destination that has a sellable package, S<n> for each sellable package. */
async function readKeys(tx: Parameters<typeof sellablePackages>[0], today: CalendarDate): Promise<ReadKeys> {
  const ids = (await sellablePackages(tx, today)).map((one) => one.id);
  const rows = await tx.quoteTemplate.findMany({
    where: { id: { in: ids }, destinationId: { not: null } },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, title: true, destinationId: true, destination: { select: { name: true } } },
  });
  const destinations: ReadKeys["destinations"] = [];
  const packages: ReadKeys["packages"] = [];
  for (const row of rows) {
    if (row.destinationId === null || row.destination === null) continue;
    let destination = destinations.find((one) => one.id === row.destinationId);
    if (destination === undefined) {
      destination = { key: `D${String(destinations.length + 1)}`, id: row.destinationId, name: row.destination.name };
      destinations.push(destination);
    }
    packages.push({
      key: `S${String(packages.length + 1)}`,
      id: row.id,
      title: row.title,
      destination: destination.name,
      destinationId: row.destinationId,
    });
  }
  return { destinations, packages, today };
}

/** The stored facts; a row that cannot be read counts as empty, and that is logged once, with no content. */
async function factsOf(
  tx: Parameters<typeof readFacts>[0],
  deps: GroundedDependencies,
  conversationId: string,
): Promise<ChatFacts> {
  const stored = await tx.aiChat.findFirst({ where: { conversationId }, select: { facts: true } });
  if (stored !== null && !chatFacts.safeParse(stored.facts).success) {
    deps.logger?.warn({ event: "ai.facts-reset", conversationId }, "A chat's stored facts could not be read");
  }
  return readFacts(tx, conversationId);
}

/** Either why the turn ends now (the outcome string), or everything it needs. */
export async function prepareTurn(deps: GroundedDependencies, input: TurnInput, now: Date): Promise<Prepared | string> {
  return deps.db.forOrg(input.organizationId, async (tx) => {
    if (!(await aiEnabled(tx))) return "off";
    const settings = await autopilotOf(tx);
    const chat = await tx.whatsappConversation.findUnique({
      where: { id: input.conversationId },
      select: { id: true, personId: true, lastInboundAt: true, state: true, hidden: true },
    });
    if (chat === null) return "nothing";
    const blocked = await mayWrite(tx, chat, settings, input.kind, now);
    if (blocked !== null) return blocked;
    const history = await chatHistory(tx, chat.id);
    if (history.messages.length === 0) return "nothing";
    const timeZone = await organizationTimeZone(tx, input.organizationId);
    // Each model call reserves its own call later; here only a month already full ends the turn.
    if ((await usedThisMonth(tx, now, timeZone)) >= MONTHLY_AI_LIMIT) return "limit";
    const today = calendarDateIn(now, timeZone);
    const transcript: ChatLine[] = history.messages.map((message) => ({
      from: message.role === "user" ? "customer" : "agency",
      text: message.content,
    }));
    const lastTurn = history.messages.at(-1);
    return {
      settings,
      chat,
      messages: history.messages,
      sent: (
        await tx.whatsappMessage.findMany({
          where: { conversationId: chat.id, direction: "out", body: { not: null } },
          orderBy: { occurredAt: "desc" },
          take: RECENT_SENT,
          select: { body: true },
        })
      ).map((row) => row.body ?? ""),
      transcript,
      facts: await factsOf(tx, deps, chat.id),
      timeZone,
      today,
      keys: await readKeys(tx, today),
      destinationNames: (await tx.destination.findMany({ select: { name: true } })).map((one) => one.name),
      knowledge: await knowledgePack(tx, aboutCustomer(transcript), { ownOnly: true }),
      learnings: settings.learning ? await activeLessons(tx) : [],
      voice: await chatVoiceOf(tx, chat.id),
      natural: await naturalIn(tx, chat.id, settings),
      instructions: (await tx.aiSettings.findFirst({ select: { instructions: true } }))?.instructions ?? "",
      factsWords: (await leadFactsFor(tx, chat.personId)).words,
      calendar: calendarText(now, timeZone),
      dateChecks:
        input.kind === "reply" && lastTurn?.role === "user" ? dateChecks(lastTurn.content, now, timeZone) : [],
      supplierStateCode: (await getOrganizationProfile(tx, input.organizationId))?.gstStateCode ?? null,
    };
  });
}
