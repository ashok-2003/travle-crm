// The lite follow-up turn's one read (plan 3b): the gates a reply turn passes, the silence it goes into, the open lead
// it keeps going and the agency's waking hours, then only what the follow-up's line needs, never Understand or a
// lookup: the chat's lines and facts, the package the facts chose (what to ask next depends on its pickups and rooms),
// the agency's names and places, and code's decision.
import type { OrgTx } from "@travel-crm/db";
import { openLeadOfChat } from "../../crm/index.js";
import { organizationTimeZone } from "../../identity/index.js";
import { calendarDateIn } from "../../kernel/index.js";
import { sellablePackages } from "../../quotes/index.js";
import type { ChatRow } from "../may-write.js";
import { agentBasicsOf } from "../agency-answers.js";
import { agentSetupOf } from "../agent-setup.js";
import { autopilotOf } from "../autopilot.js";
import { mayWrite } from "../may-write.js";
import { aiEnabled } from "../settings.js";
import { MONTHLY_AI_LIMIT, usedThisMonth } from "../usage.js";
import { decide } from "./decide/decide.js";
import { inWakingHours, nextMorning, stillQuiet } from "./follow-ups.js";
import { situationOf } from "./lookups/situation.js";
import { factsForLead, readLiteFacts } from "./merge.js";
import { chatLines, placesOf, usableNameOf, type LitePrepared } from "./prepare.js";
import { packageIndexOf } from "./prepare-lead.js";
import type { Decision, LiteDependencies, LiteOutcome, LiteTurnInput, Situation } from "./types.js";

export type NudgePrepared = Pick<
  LitePrepared,
  "chat" | "timeZone" | "today" | "summary" | "leadId" | "messages" | "sent" | "index" | "places" | "basics" | "answers"
> & { decision: Decision; situation: Situation };

/** Either why the follow-up ends now (the outcome), or everything its line and act need. */
export async function prepareNudge(
  deps: Pick<LiteDependencies, "db">,
  input: LiteTurnInput,
  now: Date,
): Promise<NudgePrepared | LiteOutcome> {
  const { organizationId } = input;
  return deps.db.forOrg(organizationId, async (tx: OrgTx) => {
    const settings = await autopilotOf(tx);
    if (!(await aiEnabled(tx)) || !settings.autopilot) return "off";
    const found = await tx.whatsappConversation.findUnique({
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
    if (found === null) return "nothing";
    const chat: ChatRow = {
      id: found.id,
      personId: found.personId,
      lastInboundAt: found.lastInboundAt,
      state: found.state,
      hidden: found.hidden,
    };
    const blocked = await mayWrite(tx, chat, settings, "nudge", now);
    if (blocked !== null) return blocked;
    const state = await tx.aiChat.findFirst({
      where: { conversationId: chat.id },
      select: { followUpsSent: true, summary: true },
    });
    // Two went already: a time left on the chat brings no third.
    if (state === null || state.followUpsSent >= 2) return "nothing";
    if (!(await stillQuiet(tx, chat.id))) return "answered";
    // A lead the team closed (won, lost, not a lead) with no word to the customer was a person's decision: no "picking
    // this up again" goes after it, and a follow-up never opens a lead.
    const lead = await openLeadOfChat(tx, chat.personId);
    if (lead === null) return "no_open_lead";
    const timeZone = await organizationTimeZone(tx, organizationId);
    // Never at night, however late the job reached it: it waits for 09:00 while the window still holds it, else it is
    // let go (the job cleared its time when it claimed it).
    if (!inWakingHours(now, timeZone)) {
      const morning = chat.lastInboundAt === null ? null : nextMorning(now, chat.lastInboundAt, timeZone);
      if (morning !== null) {
        await tx.aiChat.updateMany({
          where: { conversationId: chat.id, followUpAt: null },
          data: { followUpAt: morning },
        });
      }
      return "night";
    }
    const today = calendarDateIn(now, timeZone);
    const sellable = await sellablePackages(tx, organizationId, today);
    // An agent its owner can no longer have answer (the setup undone) writes no follow-up either.
    if (!(await agentSetupOf(tx, organizationId, today, sellable)).ready) return "not_ready";
    if ((await usedThisMonth(tx, now, timeZone)) >= MONTHLY_AI_LIMIT) return "limit";
    const lines = await chatLines(tx, chat.id);
    const facts = factsForLead(await readLiteFacts(tx, chat.id), lead.id);
    // The facts' own package alone, while it is still for sale: the next question depends on its pickups and rooms.
    const index = await packageIndexOf(
      tx,
      sellable.filter((one) => one.id === facts.packageId),
      today,
      now,
    );
    const situation = await situationOf(tx, { index, answers: {}, facts, today, now }, []);
    const places = await placesOf(tx, index);
    const name = await usableNameOf(tx, found);
    const basics = await agentBasicsOf(tx);
    const decision = decide({
      kind: "nudge",
      checked: null,
      before: facts,
      facts,
      burst: { kinds: [], question: false },
      index,
      situation,
      adPackageId: null,
      openBooking: null,
      hasBooking: false,
      detailsChanged: false,
      mayBePayment: false,
      nameUsable: name !== null,
      leadStage: null,
      places,
      followUpsSent: state.followUpsSent,
    });
    return {
      chat,
      timeZone,
      today,
      summary: state.summary,
      leadId: lead.id,
      messages: lines.messages,
      sent: lines.sent,
      index,
      places,
      basics: { agentName: basics.agentName, tone: basics.tone === "professional" ? "professional" : "friendly" },
      // A follow-up quotes none of the agency's answers.
      answers: {},
      decision,
      situation,
    };
  });
}
