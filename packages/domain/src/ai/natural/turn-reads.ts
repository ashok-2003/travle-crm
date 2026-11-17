// What a natural turn reads besides the model, shared by the dry turn (Try it, the bench) and the live one: what the app
// does before the model (ruling 6: a payment screenshot or a voice note nobody could play), what the guards and the
// trace's flags read of the agency's data and of the chat the model read, and the read tools on the agency's data.
import type { AgencyAnswers, NaturalFacts } from "@travel-crm/contracts/ai";
import type { Database, OrgTx } from "@travel-crm/db";
import type { CalendarDate } from "../../kernel/index.js";
import type { GuardContext, traceFlags } from "./guards/check-words.js";
import { groundedAmounts, tripTextOf } from "./guards/grounded.js";
import type { LoopIO } from "./loop.js";
import { runReadTool } from "./tools/read-tools.js";
import { tripSheetsOf } from "./trips/trip-sheets.js";
import type { NaturalChatLine, QuoteFigures, ReadContext, StagedAction, StagedSet, TripSheet } from "./types.js";

export type FlagContext = Parameters<typeof traceFlags>[1];

/** What the guards read of the agency: its day, its answers and its trips as the model read them. */
export interface GuardAgency {
  today: CalendarDate;
  answers: AgencyAnswers;
  sheets: readonly TripSheet[];
}

/** A booking the data shows done: G3 lets the words say so. */
export interface DoneSoFar {
  paymentConfirmed: boolean;
  bookingConfirmed: boolean;
}

const DAY_MS = 86_400_000;
const TEAM_DAYS = 30;
const PAYMENT_NOTICE =
  "Their payment screenshot is with you to check: thank them and say you'll confirm here once it's checked. A person takes this chat over after your reply.";
const VOICE_NOTICE = "Their voice note couldn't be played; ask them to type what they said.";
const PAYMENT_CHECK: StagedAction = {
  tool: "hand_over",
  reason: "payment_check",
  summary: "A payment screenshot came in this chat: check it in Payments.",
};

/**
 * Ruling 6, before the model: a payment screenshot, or a voice note nobody could play, gets one call with no tools and
 * the notice of what the app did; code hands the screenshot to the team itself.
 */
export function beforeTheModel(newLines: readonly NaturalChatLine[]): {
  notice: string | null;
  withTools: boolean;
  forced: StagedAction[];
} {
  if (newLines.some((line) => line.mayBePayment === true)) {
    return { notice: PAYMENT_NOTICE, withTools: false, forced: [PAYMENT_CHECK] };
  }
  if (newLines.some((line) => line.untranscribed === true))
    return { notice: VOICE_NOTICE, withTools: false, forced: [] };
  return { notice: null, withTools: true, forced: [] };
}

/**
 * What the guards and the trace's flags read: of the chat, only the lines the model read (`shown`), the Team's of the
 * last 30 days; a trip get_trip read counts whole from then on (G1 grounds its text), and G1 grounds the totals told and
 * the live offer the turn block shows. `done` is what the data shows paid or confirmed (none in a dry turn).
 */
export function guardReads(
  agency: GuardAgency,
  shown: readonly NaturalChatLine[],
  facts: NaturalFacts,
  now: Date,
  done: DoneSoFar = { paymentConfirmed: false, bookingConfirmed: false },
) {
  const { today, answers } = agency;
  const whole = new Map<string, TripSheet>();
  const sheets = () => agency.sheets.map((sheet) => whole.get(sheet.packageId) ?? sheet);
  const ownerText = () => [...Object.values(answers), ...sheets().map(tripTextOf)].join("\n");
  const since = now.getTime() - TEAM_DAYS * DAY_MS;
  const teamLines = shown.filter((line) => line.from === "team" && line.at.getTime() >= since).map((line) => line.text);
  const customerText = shown
    .filter((line) => line.from === "customer")
    .map((line) => line.text)
    .join("\n");
  // The loop's final words read it at the end of the turn, so a trip read whole updates it in place.
  const flagContext: FlagContext = { sheets: sheets(), ownerText: ownerText(), customerText, today };
  return {
    flagContext,
    async readWhole(tx: OrgTx, label: string) {
      const cut = agency.sheets.find((sheet) => sheet.label === label);
      if (cut === undefined) return;
      const [sheet] = await tripSheetsOf(tx, [{ id: cut.packageId, kind: "group" }], today, now, { whole: true });
      if (sheet === undefined) return;
      whole.set(cut.packageId, { ...sheet, label });
      flagContext.sheets = sheets();
      flagContext.ownerText = ownerText();
    },
    context(staged: StagedSet, quoted: readonly QuoteFigures[]): GuardContext {
      const offer = staged.get("offer_booking");
      return {
        grounded: groundedAmounts({
          sheets: sheets(),
          today,
          answers,
          teamLines,
          told: facts.told,
          quoted,
          liveOffer: facts.offer,
          now,
        }),
        customerText,
        offer: offer?.tool === "offer_booking" ? offer.offer : null,
        ...done,
        teamText: teamLines.join("\n"),
        ownerText: ownerText(),
        today,
      };
    },
  };
}

export type GuardReads = ReturnType<typeof guardReads>;

/** The loop's read tools, each in a transaction of its own; a trip get_trip read counts whole for the guards from then on. */
export function readTools(
  db: Database,
  organizationId: string,
  readContext: (tx: OrgTx) => ReadContext,
  reads: GuardReads,
): LoopIO["read"] {
  return (name, args) =>
    db.forOrg(organizationId, async (tx) => {
      const answer = await runReadTool(readContext(tx), name, args);
      const label = args.trip_id;
      if (name === "get_trip" && typeof label === "string" && !answer.result.startsWith("refused:")) {
        await reads.readWhole(tx, label);
      }
      return answer;
    });
}
