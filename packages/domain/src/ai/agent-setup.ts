// The AI agent's setup checklist, the switch that turns it on (only once every required step is done) and the chats it
// handed over to a person. The steps read what other modules own (the agency's "Use the AI" switch among them); only the
// autopilot column is written here.
import {
  agencyQuestionTopics,
  agentSetup,
  type AgentSetup,
  type HandedOverChat,
  type NeedsMeInput,
} from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { adsOf, chatNameOf, inboxStatusOf, visibleConversations } from "../inbox/index.js";
import { DomainError, type CalendarDate } from "../kernel/index.js";
import { agencyPaymentDetailsOf, paymentDetailsReady } from "../profile/index.js";
import { packagesAwaitingPayment, sellablePackages } from "../quotes/index.js";
import { agentPauseOf } from "../subscriptions/index.js";
import { agencyAnswersOf, agentBasicsOf } from "./agency-answers.js";
import { autopilotOf } from "./autopilot.js";
import { aiEnabled } from "./settings.js";

const HANDED_OVER_SHOWN = 20;

/** `sellable`: the packages the AI may sell today, when the caller has read them already (the lite turn reads them once). */
export async function agentSetupOf(
  tx: OrgTx,
  organizationId: string,
  today: CalendarDate,
  sellable?: readonly { id: string; kind: string }[],
): Promise<AgentSetup> {
  // One step at a time: a transaction runs one query at once.
  // The page shows the agency's own connection, whatever this server has configured.
  const status = await inboxStatusOf(tx, true);
  // The lite agent books group departures only: a custom package the AI may quote does not make the agent ready.
  const packages = (sellable ?? (await sellablePackages(tx, organizationId, today))).filter(
    (one) => one.kind === "group",
  );
  const awaitingPayment = await packagesAwaitingPayment(tx, organizationId, today);
  const payment = await agencyPaymentDetailsOf(tx, organizationId);
  const answers = await agencyAnswersOf(tx);
  const basics = await agentBasicsOf(tx);
  const ads = await adsOf(tx);
  const settings = await autopilotOf(tx);
  // The agent answers nothing while the agency's AI is off, whatever its own switch says (the turn reads it first).
  const aiOn = await aiEnabled(tx);
  const pause = await agentPauseOf(tx, organizationId);
  const answered = Object.keys(answers).length;
  const linked = ads.filter((ad) => ad.packageId !== null).length;
  const steps: AgentSetup["steps"] = [
    { key: "ai", done: aiOn, optional: false, count: null, total: null },
    { key: "whatsapp", done: status.connected, optional: false, count: null, total: null },
    // "total" here is the switched-on packages held back only by the missing payment details (the line says so).
    { key: "packages", done: packages.length > 0, optional: false, count: packages.length, total: awaitingPayment },
    { key: "payment", done: paymentDetailsReady(payment), optional: false, count: null, total: null },
    {
      key: "answers",
      done: answered === agencyQuestionTopics.length,
      optional: false,
      count: answered,
      total: agencyQuestionTopics.length,
    },
    { key: "basics", done: basics.agentName.trim() !== "", optional: false, count: null, total: null },
    { key: "ads", done: linked === ads.length, optional: true, count: linked, total: ads.length },
  ];
  return agentSetup.parse({
    steps,
    ready: steps.every((step) => step.optional || step.done),
    on: settings.autopilot,
    pausedBySupport: pause !== null,
  });
}

/**
 * Turns the agent on or off. Off is always allowed; on needs every required step done, and the agency's AI first (its
 * own refusal, as every AI feature's). Only the autopilot column changes.
 */
export async function setAgentOn(
  tx: OrgTx,
  access: MemberAccess,
  on: boolean,
  today: CalendarDate,
): Promise<AgentSetup> {
  if (on && !(await aiEnabled(tx))) {
    throw new DomainError(
      "CONFLICT",
      "AI_OFF",
      "The AI is off for this agency: an Owner or Admin turns it on in Settings, AI",
    );
  }
  if (on && !(await agentSetupOf(tx, access.organizationId, today)).ready) {
    throw new DomainError("VALIDATION", "AGENT_SETUP_INCOMPLETE", "Finish the AI agent's setup steps first.");
  }
  const before = (await autopilotOf(tx)).autopilot;
  await tx.aiAutopilot.upsert({
    where: { organizationId: access.organizationId },
    create: { organizationId: access.organizationId, autopilot: on, updatedBy: access.userId },
    update: { autopilot: on, updatedBy: access.userId },
  });
  const entry = {
    entityType: "ai_autopilot",
    entityId: access.organizationId,
    before: { autopilot: before },
    after: { autopilot: on },
  };
  // Each branch names its action as a literal, so the audit test can read every recorded action.
  if (on) await recordAudit(tx, access, { action: "ai-agent.turned-on", ...entry });
  else await recordAudit(tx, access, { action: "ai-agent.turned-off", ...entry });
  return agentSetupOf(tx, access.organizationId, today);
}

/**
 * Open chats the agent handed over, newest first, among those the member's inbox may show. `mine` keeps the chats of
 * people with a live lead the member owns and, for someone who manages the AI, those whose leads nobody owns.
 */
export async function handedOverChatsOf(
  tx: OrgTx,
  access: MemberAccess,
  { mine }: NeedsMeInput,
): Promise<HandedOverChat[]> {
  const ownedLead = { deletedAt: null, ownerUserId: access.userId };
  const nobodys = { NOT: { person: { is: { leads: { some: { deletedAt: null, ownerUserId: { not: null } } } } } } };
  const ownership = mine
    ? [
        access.permissions.has("ai:manage")
          ? { OR: [{ person: { is: { leads: { some: ownedLead } } } }, nobodys] }
          : { person: { is: { leads: { some: ownedLead } } } },
      ]
    : [];
  const rows = await tx.aiChat.findMany({
    where: {
      handedOffAt: { not: null },
      // A hand-over the team has since answered is no longer waiting on anyone (replying clears needsReply).
      conversation: {
        AND: [{ state: "open", hidden: false, needsReply: true }, visibleConversations(access), ...ownership],
      },
    },
    orderBy: [{ handedOffAt: "desc" }, { id: "desc" }],
    take: HANDED_OVER_SHOWN,
    select: {
      conversationId: true,
      handoffReason: true,
      handedOffAt: true,
      conversation: { select: { phoneE164: true, profileName: true, person: { select: { name: true } } } },
    },
  });
  return rows.flatMap((row) =>
    row.handedOffAt === null
      ? []
      : [
          {
            conversationId: row.conversationId,
            name: chatNameOf(row.conversation) ?? row.conversation.phoneE164,
            reason: row.handoffReason,
            since: row.handedOffAt.toISOString(),
          },
        ],
  );
}
