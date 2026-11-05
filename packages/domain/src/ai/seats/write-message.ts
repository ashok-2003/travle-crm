// A personal message offering a departure's empty seats to one person (release ai3). One AI call for one person, written for
// the staff member to read, change and open in their own WhatsApp (wa.me); nothing is sent by the product. The price is
// `{price}` for plain code to fill, an amount the model typed is taken out, and a count of seats stays out unless the agency's
// setting allows it. Three short transactions around the model: the checks and one monthly call, the model, then the fill's row
// (which later proves "drafted by AI, approved by X"). The words are kept nowhere.
import type { SeatMessage, WriteSeatMessageInput } from "@travel-crm/contracts/ai";
import type { Database, OrgTx } from "@travel-crm/db";
import type { AiModel } from "@travel-crm/integrations/ai";
import {
  countsOf,
  departureSettingsOf,
  findDeparture,
  seatsSoldAndHeld,
  stateOf,
  type DepartureRow,
} from "../../departures/index.js";
import { organizationTimeZone, type MemberAccess } from "../../identity/index.js";
import { formatMoney, money } from "../../kernel/index.js";
import { knowledgeWords } from "../knowledge.js";
import { modelRefusal, refuse } from "../refusals.js";
import { aiEnabled } from "../settings.js";
import { hashOf } from "../suggest.js";
import { MONTHLY_AI_LIMIT, recordTokens, releaseAiCall, reserveAiCall, usedThisMonth } from "../usage.js";
import { withoutTypedAmounts } from "../write-up/tokens.js";
import { assertOfferable, offerableLeads, type Candidate } from "./interested.js";
import { reachOutPrompt, type ReachOutFacts } from "./prompt.js";
import { withoutSeatCounts } from "./seat-words.js";

const MAX_CHARS = 1200;

const dayFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

interface Prepared {
  timeZone: string;
  facts: ReachOutFacts;
  departure: DepartureRow;
  /** Whether the price is stated including GST: the switch of the package a departure is linked to; any other is plus GST. */
  pricesIncludeGst: boolean;
  /** The count a message may say, or null. */
  allowedCount: number | null;
}

async function prepare(
  tx: OrgTx,
  access: MemberAccess,
  input: WriteSeatMessageInput,
  context: { agencyName: string; now: Date },
): Promise<Prepared> {
  if (!(await aiEnabled(tx))) {
    throw refuse("AI_OFF", "The AI is off for this agency: an Owner or Admin turns it on in Settings, AI");
  }
  const departure = await findDeparture(tx, input.departureId);
  await assertOfferable(tx, departure, context.now);
  // The same rules as the list, again: a person who has since opted out or been offered the seats is refused.
  const person: Candidate | undefined = (await offerableLeads(tx, access, departure, context.now, input.leadId))[0];
  if (person === undefined) {
    throw refuse("SEAT_OFFER_NOT_ALLOWED", "This person can't be offered these seats now");
  }
  const timeZone = await organizationTimeZone(tx, access.organizationId);
  if (!(await reserveAiCall(tx, context.now, timeZone))) {
    throw refuse("AI_MONTH_LIMIT", "This agency has used this month's AI suggestions", "LIMIT_REACHED");
  }
  const settings = await tx.aiSettings.findFirstOrThrow({ select: { instructions: true, writeStyle: true } });
  const departureSettings = await departureSettingsOf(tx);
  const knowledge = await knowledgeWords(tx);
  const seats = (await seatsSoldAndHeld(tx, [departure.id], context.now)).get(departure.id) ?? { sold: 0, held: 0 };
  const counts = countsOf(departure.seatsTotal, seats.sold, seats.held);
  const allowedCount = departureSettings.shareSeatCounts ? counts.free : null;
  const state = stateOf(departure, counts, departureSettings.fillingFastPercent);
  const first = person.name.trim().split(/\s+/)[0] ?? "";
  const style = settings.writeStyle === "premium" || settings.writeStyle === "short" ? settings.writeStyle : "warm";
  const linked =
    departure.templateId === null
      ? null
      : await tx.quoteTemplate.findUnique({ where: { id: departure.templateId }, select: { pricesIncludeGst: true } });
  return {
    timeZone,
    departure,
    pricesIncludeGst: linked?.pricesIncludeGst ?? false,
    allowedCount,
    facts: {
      agencyName: context.agencyName,
      instructions: settings.instructions,
      knowledge,
      style,
      firstName: first === "" ? null : first,
      earlier: { destination: person.destination, travelling: person.travelling, partySize: person.partySize },
      departure: {
        title: departure.title,
        destination: departure.destination?.name ?? "",
        from: dayFormat.format(departure.startDate),
        to: dayFormat.format(departure.endDate),
        hasPrice: departure.pricePaise !== null,
        seatsLeft: allowedCount,
        fillingFast: state === "filling",
      },
    },
  };
}

/** Puts the departure's price where `{price}` is, and drops a line that wants a price when there is none. */
function withPrice(text: string, pricePaise: bigint | null, includesGst: boolean): string {
  const lines = text
    .split("\n")
    .filter((line) => !(pricePaise === null && line.includes("{price}")))
    .map((line) =>
      line.replaceAll(
        "{price}",
        pricePaise === null
          ? ""
          : `${formatMoney(money(Number(pricePaise)))} per person ${includesGst ? "including" : "plus"} GST`,
      ),
    );
  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Writes the message for one person. Refused when the AI is off, the departure can't take offers, the person may not be
 * offered it (opted out, blocked, asked in the last 14 days, not the member's lead), the month's limit is used, or the AI
 * doesn't answer (the call is then given back). Permissions and the plan's modules are the router's.
 */
export async function writeSeatMessage(
  db: Database,
  model: AiModel,
  access: MemberAccess,
  input: WriteSeatMessageInput,
  context: { agencyName: string; now: Date },
): Promise<SeatMessage> {
  const { organizationId } = access;
  if (!model.configured) throw refuse("AI_NOT_READY", "The AI isn't set up on this server yet");
  const prepared = await db.forOrg(organizationId, (tx) => prepare(tx, access, input, context));
  const giveBack = () => db.forOrg(organizationId, (tx) => releaseAiCall(tx, context.now, prepared.timeZone));
  const result = await model.complete({
    feature: "reach_out",
    messages: reachOutPrompt(prepared.facts),
    maxTokens: 400,
    // Opaque: the agency's id, never a person's.
    user: organizationId,
  });
  if (!result.ok) {
    await giveBack();
    throw modelRefusal(result.reason);
  }
  const typed = withoutTypedAmounts(result.text.trim().replace(/^["“](.*)["”]$/s, "$1"));
  const counted = withoutSeatCounts(typed.text, prepared.allowedCount);
  // Staff are told when the model's own amount or seat count was taken out, as they are for a write-up.
  const removedAmounts = typed.removed || counted !== typed.text;
  const text = withPrice(counted, prepared.departure.pricePaise, prepared.pricesIncludeGst).slice(0, MAX_CHARS);
  if (text === "") {
    await giveBack();
    throw refuse("AI_UNAVAILABLE", "The AI didn't answer");
  }
  return db.forOrg(organizationId, async (tx) => {
    await recordTokens(tx, context.now, prepared.timeZone, { input: result.inputTokens, output: result.outputTokens });
    const hash = hashOf(text);
    const row = await tx.aiFill.create({
      data: {
        target: "departure_offer",
        subjectType: "lead",
        subjectId: input.leadId,
        requestedBy: access.userId,
        inputKind: "text",
        model: result.model,
        proposalHash: hash,
        fields: ["message"],
        fieldHashes: { message: hash },
      },
      select: { id: true },
    });
    return {
      fillId: row.id,
      text,
      removedAmounts,
      usedThisMonth: await usedThisMonth(tx, context.now, prepared.timeZone),
      monthlyLimit: MONTHLY_AI_LIMIT,
    };
  });
}
