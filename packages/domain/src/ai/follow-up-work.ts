// The AI's side of follow-ups that come due (the owner, 2026-10-30): each minute, before the nudges, every open follow-up
// on a lead whose time came in the last few hours is worked once for that time. The AI writes about it in the lead's
// WhatsApp chat while the 24-hour window is open, and what happened is kept (ai_follow_up_touch) for the Follow-ups
// screen. The follow-up stays open: the team still calls. One moved to a later time is worked again at its new time.
// A due time is claimed with its row before the turn, so two runs never both write.
import type { FollowUpTouchOutcome } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { AI_TOKEN_PREFIX, runAgentTurn, type AgentDependencies } from "./agent.js";
import { aiAllowed } from "./allowed.js";
import { autopilotOf } from "./autopilot.js";
import { aiEnabled } from "./settings.js";

/** A follow-up older than this when first seen (the worker slept, the switch was off) is left for the team alone. */
const RECENT_MS = 6 * 3_600_000;
const PER_AGENCY = 20;

/** The lead's WhatsApp chat: the one its customer wrote in last. */
async function chatOfLead(tx: OrgTx, leadId: string): Promise<{ id: string } | null> {
  const lead = await tx.lead.findFirst({ where: { id: leadId }, select: { personId: true } });
  if (lead === null) return null;
  return tx.whatsappConversation.findFirst({
    where: { personId: lead.personId },
    orderBy: [{ lastInboundAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
    select: { id: true },
  });
}

/** How a turn's outcome reads on the screen when no message went. */
function outcomeOf(turn: string): FollowUpTouchOutcome {
  switch (turn) {
    case "window_closed":
      return "window_closed";
    case "opted_out":
      return "opted_out";
    case "off":
    case "closed":
    case "handed_off":
    case "person_answering":
    case "day_limit":
    case "not_allowed":
    case "not_configured":
      return "off";
    default:
      return "failed";
  }
}

/** One agency's follow-ups now due: each claimed, written about, and its outcome kept. Returns how many were worked. */
export async function workDueFollowUps(
  dependencies: AgentDependencies,
  organizationId: string,
  now: Date,
): Promise<number> {
  if (!aiAllowed(await dependencies.subscriptions.entitlementsOf(organizationId))) return 0;
  const claimed = await dependencies.db.forOrg(organizationId, async (tx) => {
    if (!(await aiEnabled(tx)) || !(await autopilotOf(tx)).followUpTasks) return [];
    const rows = await tx.task.findMany({
      where: {
        kind: "follow-up",
        recordType: "lead",
        doneAt: null,
        cancelledAt: null,
        dueAt: { lte: now, gt: new Date(now.getTime() - RECENT_MS) },
      },
      orderBy: { dueAt: "asc" },
      take: PER_AGENCY * 3,
      select: {
        id: true,
        title: true,
        dueAt: true,
        recordId: true,
        aiTouches: { select: { dueAt: true }, orderBy: { dueAt: "desc" }, take: 3 },
      },
    });
    const fresh = rows
      .filter((row) => !row.aiTouches.some((touch) => touch.dueAt.getTime() === row.dueAt.getTime()))
      .slice(0, PER_AGENCY);
    const mine = [];
    for (const row of fresh) {
      if (row.recordId === null) continue;
      const chat = await chatOfLead(tx, row.recordId);
      // The claim: "failed" until the turn says otherwise, so a crash mid-way reads as what it was.
      const { count } = await tx.aiFollowUpTouch.createMany({
        data: [
          {
            taskId: row.id,
            dueAt: row.dueAt,
            conversationId: chat?.id ?? null,
            outcome: chat === null ? "no_chat" : "failed",
          },
        ],
        skipDuplicates: true,
      });
      if (count === 1 && chat !== null) mine.push({ task: row, conversationId: chat.id });
    }
    return mine;
  });
  for (const { task, conversationId } of claimed) {
    const token = `follow-up:${task.id}:${String(task.dueAt.getTime())}`;
    let turn: string;
    try {
      turn = await runAgentTurn(
        dependencies,
        { organizationId, conversationId, kind: "followUp", token, followUp: task.title },
        now,
      );
    } catch {
      turn = "failed";
    }
    await dependencies.db.forOrg(organizationId, async (tx) => {
      const sent = await tx.whatsappMessage.findFirst({
        where: { conversationId, clientToken: `${AI_TOKEN_PREFIX}${token}` },
        select: { id: true },
      });
      await tx.aiFollowUpTouch.updateMany({
        where: { taskId: task.id, dueAt: task.dueAt },
        data: sent === null ? { outcome: outcomeOf(turn) } : { outcome: "sent", messageId: sent.id },
      });
    });
  }
  return claimed.length;
}
