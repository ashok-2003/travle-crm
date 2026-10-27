// The AI sales agent's turn (the AI sales agent, ADR 0029 as the owner widened it on 2026-10-27): for one chat, one call
// to the model gives the reply to send (or none), whether to hand the chat to a person and why, what to remember, and the
// lead's insight (how likely it books, why, fake or not, the next step, what the customer wants). Code decides the rest:
// the reply goes only inside the 24-hour window, to someone who hasn't asked to stop, while the agent is on in the chat,
// no person is answering it and the day's count has room; it never sets a price that isn't in the knowledge, never
// confirms a booking or takes money: those are a person's, so the agent hands over. Every call's usage is kept.
import { agentAnswer, type AgentAnswer } from "@travel-crm/contracts/ai";
import type { AiMessage, AiModel } from "@travel-crm/integrations/ai";
import type { Database, OrgTx } from "@travel-crm/db";
import { noticeKey } from "../crm/index.js";
import { queueSystemText, whatsappConsentOf, windowIsOpen } from "../inbox/index.js";
import { systemActor } from "../kernel/index.js";
import { notify } from "../notifications/index.js";
import { chatHistory, knowledgePack, leadFactsFor } from "./context.js";
import { aiSettingsOf, type AiSettingsRow } from "./settings.js";

export const AI_HANDOFF_KIND = "ai.handoff";
/** A person who wrote in the chat this recently is answering it: the agent keeps quiet. */
const PERSON_ANSWERING_MS = 30 * 60_000;

export interface AgentDependencies {
  db: Database;
  ai: AiModel;
  /** The agency's name, for the agent to speak for. */
  agencyName: (organizationId: string) => Promise<string>;
}

export type TurnKind = "reply" | "nudge" | "insight";

export function agentPrompt(
  settings: AiSettingsRow,
  agency: string,
  kind: TurnKind,
  knowledge: string,
  facts: string,
  memory: string,
): string {
  const name = settings.agentName.trim() === "" ? `the team at ${agency}` : settings.agentName.trim();
  const task =
    kind === "nudge"
      ? "The customer has gone quiet. Write ONE short, warm follow-up that moves them a step forward (a question, or the next detail they need). Never pushy."
      : kind === "insight"
        ? "Do not write a reply: set reply to an empty string. Only judge the lead."
        : "Answer the customer's last message.";
  return `You are ${name}, the WhatsApp travel sales assistant of ${agency}, an Indian travel agency.
${task}

Rules you always follow:
- Use ONLY the agency's knowledge below for prices, inclusions, dates, availability and policies. Never invent or guess a price, a discount, a date or availability. If it isn't in the knowledge, say you will check with the team, and hand off.
- Hand off (handoff: true, with the reason) when the customer wants to book, pay, confirm or cancel, asks for a discount or a custom price, complains, asks for a person, sends something you can't read (a photo, a voice note), or asks anything the knowledge doesn't answer. When you hand off, your reply tells them a colleague will get back to them shortly.
- Never confirm a booking, never take or ask for payment details, never promise what the knowledge doesn't say.
- Write like a friendly Indian travel agent on WhatsApp: short (1 to 4 short lines), warm, no long lists, at most one emoji. Reply in the customer's own language and script (English, Hindi or Hinglish).
- Learn what they need, one question at a time: destination, dates, how many travellers (and children's ages), budget, leaving from. Never ask again what is already known.
- If asked whether you are a bot, say you are ${agency}'s virtual assistant and a person can join any time.
- Never share anything about other customers.
${settings.instructions.trim() === "" ? "" : `\nThe agency's own instructions:\n${settings.instructions.trim()}\n`}
What we know about this customer:
${facts}

What you remember of this chat:
${memory.trim() === "" ? "(nothing yet)" : memory.trim()}

The agency's knowledge:
${knowledge}

Answer with ONE JSON object and nothing else:
{"reply": string, "handoff": boolean, "handoffReason": string, "memory": string (the facts, wishes and promises of this chat so far, under 800 characters, replacing what you remembered), "score": integer 0-100 (how likely this lead books with us in the next 2 weeks), "label": "hot"|"warm"|"cold", "reasons": [short strings], "fake": boolean (spam, test, gibberish, wrong number, abuse, a competitor probing), "fakeReason": string, "nextStep": string (what our salesperson should do next), "facts": {"destination": string|null, "when": string|null, "travellers": string|null, "budget": string|null}}`;
}

/** The model's answer as JSON, read leniently: a code fence or words around the object are dropped. */
export function parseAnswer(text: string): AgentAnswer | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return agentAnswer.parse(JSON.parse(text.slice(start, end + 1)));
  } catch {
    return null;
  }
}

interface ChatFacts {
  id: string;
  personId: string | null;
  lastInboundAt: Date | null;
  state: string;
  hidden: boolean;
}

/** Whether the agent answers in a chat: its own mode, else the agency's autopilot. */
export const agentAnswers = (mode: string | undefined, autopilot: boolean) =>
  mode === "on" || (mode !== "off" && autopilot);

/** Whether the agent may write in this chat now, and why not when it may not. */
async function mayWrite(
  tx: OrgTx,
  chat: ChatFacts,
  settings: AiSettingsRow,
  kind: TurnKind,
  now: Date,
): Promise<string | null> {
  if (chat.state !== "open" || chat.hidden) return "closed";
  if (!windowIsOpen(chat.lastInboundAt, now)) return "window_closed";
  // A reply answers the customer's last message once: a person or the agent itself did if either wrote after it. Other
  // automation (a trip kit for a keyword, a greeting) is no answer, so the agent still replies after it.
  if (kind === "reply" && chat.lastInboundAt !== null) {
    const answered = await tx.whatsappMessage.findFirst({
      where: {
        conversationId: chat.id,
        direction: "out",
        occurredAt: { gt: chat.lastInboundAt },
        OR: [{ origin: { in: ["staff_crm", "staff_phone"] } }, { clientToken: { startsWith: "ai:" } }],
      },
      select: { id: true },
    });
    if (answered !== null) return "answered";
  }
  const state = await tx.aiChat.findFirst({ where: { conversationId: chat.id } });
  if (!agentAnswers(state?.mode, settings.autopilot)) return "off";
  if (state?.handedOffAt != null) return "handed_off";
  const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  if (state?.repliesOn?.getTime() === today.getTime() && state.repliesCount >= settings.maxRepliesPerDay)
    return "day_limit";
  if (chat.personId !== null && (await whatsappConsentOf(tx, chat.personId)).state === "withdrawn") return "opted_out";
  const person = await tx.whatsappMessage.findFirst({
    where: {
      conversationId: chat.id,
      direction: "out",
      origin: { in: ["staff_crm", "staff_phone"] },
      occurredAt: { gt: new Date(now.getTime() - PERSON_ANSWERING_MS) },
    },
    select: { id: true },
  });
  return person === null ? null : "person_answering";
}

/**
 * One turn of the agent in a chat: `reply` to the customer's last message, `nudge` a quiet one, or only the `insight`.
 * Returns what happened, for the log. Safe to run twice: a reply's token is the message it answers.
 */
export async function runAgentTurn(
  dependencies: AgentDependencies,
  input: { organizationId: string; conversationId: string; kind: TurnKind; token: string },
  now: Date,
): Promise<string> {
  const { db, ai } = dependencies;
  if (!ai.configured) return "not_configured";
  const agency = await dependencies.agencyName(input.organizationId);
  const prepared = await db.forOrg(input.organizationId, async (tx) => {
    const settings = await aiSettingsOf(tx);
    const chat = await tx.whatsappConversation.findUnique({
      where: { id: input.conversationId },
      select: { id: true, personId: true, lastInboundAt: true, state: true, hidden: true },
    });
    if (chat === null) return null;
    const blocked = input.kind === "insight" ? "insight" : await mayWrite(tx, chat, settings, input.kind, now);
    if (blocked !== null && !settings.scoring) return null;
    const history = await chatHistory(tx, chat.id);
    const memory =
      (await tx.aiChat.findFirst({ where: { conversationId: chat.id }, select: { memory: true } }))?.memory ?? "";
    const facts = await leadFactsFor(tx, chat.personId);
    const knowledge = await knowledgePack(
      tx,
      history.messages
        .slice(-6)
        .map((message) => message.content)
        .join(" "),
    );
    // Writing only when nothing stops it; else the same call judges the lead and writes nothing.
    const kind: TurnKind = blocked === null ? input.kind : "insight";
    return { settings, chat, history, memory, facts, knowledge, kind, blocked };
  });
  if (prepared === null || prepared.history.messages.length === 0) return "nothing";
  const messages: AiMessage[] = [
    {
      role: "system",
      content: agentPrompt(
        prepared.settings,
        agency,
        prepared.kind,
        prepared.knowledge,
        prepared.facts.words,
        prepared.memory,
      ),
    },
    ...prepared.history.messages,
  ];
  const result = await ai.complete({
    tier: prepared.kind === "insight" ? "fast" : "chat",
    messages,
    json: true,
    maxTokens: 900,
    user: input.organizationId,
  });
  if (!result.ok) return result.reason;
  const answer = parseAnswer(result.text);
  await db.forOrg(input.organizationId, (tx) =>
    tx.aiUsage.create({
      data: {
        kind: prepared.kind,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
    }),
  );
  if (answer === null) return "unreadable";

  return db.forOrg(input.organizationId, async (tx) => {
    const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
    const state = await tx.aiChat.upsert({
      where: {
        organizationId_conversationId: { organizationId: input.organizationId, conversationId: prepared.chat.id },
      },
      create: { conversationId: prepared.chat.id, memory: answer.memory },
      update: answer.memory === "" ? {} : { memory: answer.memory },
      select: { id: true, repliesOn: true, repliesCount: true },
    });
    if (prepared.facts.leadId !== null && prepared.settings.scoring) {
      const insight = {
        score: answer.score,
        label: answer.label,
        reasons: answer.reasons,
        fake: answer.fake,
        fakeReason: answer.fake && answer.fakeReason !== "" ? answer.fakeReason : null,
        summary: answer.memory.slice(0, 800),
        nextStep: answer.nextStep,
        facts: answer.facts,
        model: result.model,
      };
      await tx.leadAiInsight.upsert({
        where: { organizationId_leadId: { organizationId: input.organizationId, leadId: prepared.facts.leadId } },
        create: { leadId: prepared.facts.leadId, ...insight },
        update: insight,
      });
    }
    if (prepared.kind === "insight") return prepared.blocked ?? "insight";
    const reply = answer.reply.trim();
    if (reply !== "") {
      const sent = await queueSystemText(
        tx,
        {
          conversationId: prepared.chat.id,
          body: reply,
          sentBy: null,
          origin: "automation",
          clientToken: `ai:${input.token}`,
          // Answered by the agent: the chat no longer waits, unless it is handed to a person.
          answers: !answer.handoff,
        },
        now,
      );
      if (!sent.ok) return sent.code;
      const sameDay = state.repliesOn?.getTime() === today.getTime();
      await tx.aiChat.update({
        where: { id: state.id },
        data: {
          lastReplyAt: now,
          repliesOn: today,
          repliesCount: sameDay ? state.repliesCount + 1 : 1,
          ...(prepared.kind === "nudge" ? { lastNudgeAt: now } : {}),
        },
      });
    }
    if (answer.handoff) {
      await tx.aiChat.update({
        where: { id: state.id },
        data: { handedOffAt: now, handoffReason: answer.handoffReason.slice(0, 300) || null },
      });
      await tellOwner(tx, input.organizationId, prepared.chat, answer, input.token);
    }
    return answer.handoff ? "handed_off" : "replied";
  });
}

async function tellOwner(tx: OrgTx, organizationId: string, chat: ChatFacts, answer: AgentAnswer, token: string) {
  if (chat.personId === null) return;
  const lead = await tx.lead.findFirst({
    where: { personId: chat.personId },
    orderBy: { createdAt: "desc" },
    select: { ownerUserId: true, person: { select: { name: true } } },
  });
  if (lead?.ownerUserId == null) return;
  await notify(tx, systemActor(organizationId), {
    recipientUserIds: [lead.ownerUserId],
    sourceEventId: noticeKey(`ai-handoff:${token}`, AI_HANDOFF_KIND),
    kind: AI_HANDOFF_KIND,
    title: `${lead.person.name} needs you: the AI handed the chat over`,
    body: answer.handoffReason === "" ? "Open the chat to take it from here." : answer.handoffReason.slice(0, 160),
    link: `/inbox/${chat.id}`,
    channels: ["push"],
  });
}
