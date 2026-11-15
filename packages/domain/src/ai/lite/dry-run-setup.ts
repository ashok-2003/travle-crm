// Try it's reads before its turn: the agency as a lite turn reads it (its trips, places, voice, answers, hold and payment
// lines), and the test chat as a live turn reads its own chat (the context, the burst, and what was sent already).
import type { TestAiLine } from "@travel-crm/contracts/ai";
import type { Database } from "@travel-crm/db";
import { departureSettingsOf } from "../../departures/index.js";
import { organizationTimeZone } from "../../identity/index.js";
import { calendarDateIn } from "../../kernel/index.js";
import { agencyPaymentDetailsOf, paymentDetailsReady, paymentLinesOf } from "../../profile/index.js";
import { sellablePackages } from "../../quotes/index.js";
import { agencyAnswersOf, agentBasicsOf } from "../agency-answers.js";
import { RECENT_SENT } from "../repeats.js";
import { packageIndexOf } from "./prepare-lead.js";
import { burstOf, LAST_MESSAGES, placesOf } from "./prepare.js";
import type { ContextMessage } from "./types.js";

export async function dryRunAgency(db: Database, organizationId: string, now: Date) {
  return db.forOrg(organizationId, async (tx) => {
    const timeZone = await organizationTimeZone(tx, organizationId);
    const today = calendarDateIn(now, timeZone);
    const index = await packageIndexOf(tx, await sellablePackages(tx, organizationId, today), today, now);
    const basics = await agentBasicsOf(tx);
    const payment = await agencyPaymentDetailsOf(tx, organizationId);
    return {
      timeZone,
      today,
      index,
      places: await placesOf(tx, index),
      basics: {
        agentName: basics.agentName,
        tone: basics.tone === "professional" ? ("professional" as const) : ("friendly" as const),
      },
      answers: await agencyAnswersOf(tx),
      holdHours: (await departureSettingsOf(tx)).holdHours,
      paymentLines: paymentDetailsReady(payment) ? paymentLinesOf(payment) : null,
    };
  });
}
export type DryRunAgency = Awaited<ReturnType<typeof dryRunAgency>>;

/**
 * The test chat as a live turn reads its chat: the customer's lines as theirs and the agent's as our own, the last 20 as
 * the context; the customer's lines after our last as the burst; and our lines, newest first, as sent already.
 */
export function dryRunChat(lines: readonly TestAiLine[], now: Date) {
  const all = lines.map((line, index): ContextMessage => ({
    id: `dry-run-${String(index + 1)}`,
    from: line.from === "customer" ? "customer" : "you",
    at: now,
    kind: "text",
    text: line.text,
  }));
  const messages = all.slice(-LAST_MESSAGES);
  const sent = all
    .filter((one) => one.from === "you")
    .map((one) => one.text)
    .reverse()
    .slice(0, RECENT_SENT);
  return { messages, burst: burstOf(messages), sent };
}
