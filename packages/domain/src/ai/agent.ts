// The autopilot's turn (AI step 2; ADR 0029 as the owner widened it on 2026-10-27 and 2026-10-28): for one chat, one call to
// the model gives the reply to send (or none), whether a person must take the chat or only look at it, what to remember
// and whether and when to follow up. Code decides the rest: the agency must have the AI and the autopilot on, its plan and
// subscription must allow the AI, and the shared monthly limit must have room; the reply goes only inside the 24-hour
// window, never to someone who asked to stop (in a chat with no person linked too), while the autopilot is on in the chat,
// no person is answering it and the day's count has room; prices and payment details come only from the knowledge, and a
// booking or a payment is confirmed only by a person. Every message it sends is marked as the AI's in the chat
// (clientToken "ai:...") and audited; every call's tokens are kept.
import { agentAnswer, type AgentAnswer } from "@travel-crm/contracts/ai";
import type { AiMessage, AiModel } from "@travel-crm/integrations/ai";
import type { Database, OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { organizationTimeZone } from "../identity/index.js";
import { chatOptedOut, queueSystemText, windowIsOpen } from "../inbox/index.js";
import { systemActor } from "../kernel/index.js";
import type { SubscriptionAccess } from "../subscriptions/index.js";
import { aiAllowed } from "./allowed.js";
import { agentPrompt, type TurnKind } from "./agent-prompt.js";
import { applyAnswer, type ChatFacts } from "./agent-effects.js";
import { asTranscript, chatHistory, knowledgePack, leadFactsFor } from "./agent-context.js";
import { autopilotOf, type AutopilotRow } from "./autopilot.js";
import { activeLessons } from "./learning-store.js";
import { personAnsweringUntil } from "./person-pause.js";
import { aiEnabled } from "./settings.js";
import { recordTokens, releaseAiCall, reserveAiCall } from "./usage.js";
import { chatVoiceOf } from "./chat-voice.js";
import { naturalIn } from "./voice.js";

export { AI_HANDOFF_KIND } from "./agent-effects.js";

export interface AgentDependencies {
  db: Database;
  ai: AiModel;
  subscriptions: Pick<SubscriptionAccess, "entitlementsOf">;
  /** The agency's name, for the AI to speak for. */
  agencyName: (organizationId: string) => Promise<string>;
}

/** The marker of a message the AI wrote: its client token starts with this. */
export const AI_TOKEN_PREFIX = "ai:";

/**
 * The model's answer, read leniently: the JSON object (words or a code fence around it are dropped, and a reply under
 * another name, "message" or "text", is still the reply); or, when a model answered in plain words instead, those words
 * as the reply, so the customer is never left unanswered.
 */
export function parseAnswer(text: string): AgentAnswer | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    const words = text.trim();
    return words === "" || words.length > 1500 ? null : agentAnswer.parse({ reply: words });
  }
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    if (typeof parsed !== "object" || parsed === null) return null;
    const named = parsed as Record<string, unknown>;
    const reply = named.reply ?? named.message ?? named.text ?? named.answer;
    return agentAnswer.parse({ ...named, reply });
  } catch {
    return null;
  }
}

/** Emojis and their parts: pictographs, flags' letters, skin tones, the variation selector, joiners and keycaps. */
const EMOJI = /\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]|[\u{1F3FB}-\u{1F3FF}]|️|‍|⃣/gu;

/** A reply as the agency's settings allow: no emoji at all when it chose none, whatever the model or the voice did. */
export function cleanReply(text: string, settings: Pick<AutopilotRow, "emojis">): string {
  if (settings.emojis !== "none") return text.trim();
  return text
    .replace(EMOJI, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .trim();
}

/**
 * The model's answer held to what the agency chose, in code: with "never by itself" it never steps back (a hand-over it
 * asked for becomes a flag for the team), and with no emojis none are sent.
 */
function withSettings(answer: AgentAnswer, settings: AutopilotRow, natural: boolean): AgentAnswer {
  const reply = cleanReply(answer.reply, settings);
  if ((settings.handoff !== "alert" && !natural) || !answer.handoff) return { ...answer, reply };
  return {
    ...answer,
    reply,
    handoff: false,
    attention: answer.attention.trim() === "" ? answer.handoffReason : answer.attention,
  };
}

/** Whether the autopilot answers in a chat: its own mode, else the agency's autopilot. */
export const agentAnswers = (mode: string | undefined, autopilot: boolean) =>
  mode === "on" || (mode !== "off" && autopilot);

/** Whether the AI may write in this chat now, and why not when it may not. */
async function mayWrite(
  tx: OrgTx,
  chat: ChatFacts,
  settings: AutopilotRow,
  kind: TurnKind,
  now: Date,
): Promise<string | null> {
  if (chat.state !== "open" || chat.hidden) return "closed";
  // STOP wins first, in every chat: a withdrawn consent, or a STOP in a chat with no person linked.
  if (await chatOptedOut(tx, chat)) return "opted_out";
  if (!windowIsOpen(chat.lastInboundAt, now)) return "window_closed";
  // A reply answers the customer's last message once: a person or the AI itself did if either wrote after it. Other
  // automation (a trip kit for a keyword, a greeting) is no answer, so the AI still replies after it.
  if (kind === "reply" && chat.lastInboundAt !== null) {
    // The team giving the chat back ("Let AI answer now") ends what their earlier messages answered.
    const given = (await tx.aiChat.findFirst({ where: { conversationId: chat.id }, select: { resumedAt: true } }))
      ?.resumedAt;
    const answered = await tx.whatsappMessage.findFirst({
      where: {
        conversationId: chat.id,
        direction: "out",
        occurredAt: { gt: new Date(Math.max(chat.lastInboundAt.getTime(), given?.getTime() ?? 0)) },
        OR: [{ origin: { in: ["staff_crm", "staff_phone"] } }, { clientToken: { startsWith: AI_TOKEN_PREFIX } }],
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
  return (await personAnsweringUntil(tx, chat.id, now)) === null ? null : "person_answering";
}

/**
 * One turn of the AI in a chat: `reply` to the customer's last message, or `nudge` a quiet one. Returns what happened,
 * for the log. Safe to run twice: a reply's token is the message it answers.
 */
export async function runAgentTurn(
  dependencies: AgentDependencies,
  input: { organizationId: string; conversationId: string; kind: TurnKind; token: string },
  now: Date,
): Promise<string> {
  const { db, ai } = dependencies;
  if (!ai.configured) return "not_configured";
  // No AI for an agency whose plan lacks it or whose subscription is read-only, suspended or cancelled.
  if (!aiAllowed(await dependencies.subscriptions.entitlementsOf(input.organizationId))) return "not_allowed";
  const agency = await dependencies.agencyName(input.organizationId);
  const prepared = await db.forOrg(input.organizationId, async (tx) => {
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
    if (!(await reserveAiCall(tx, now, timeZone))) return "limit";
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
    const instructions = (await tx.aiSettings.findFirst({ select: { instructions: true } }))?.instructions ?? "";
    return {
      settings,
      chat,
      history,
      memory,
      facts,
      knowledge,
      instructions,
      learnings: settings.learning ? await activeLessons(tx) : [],
      voice: await chatVoiceOf(tx, chat.id),
      natural: await naturalIn(tx, chat.id, settings),
      timeZone,
    };
  });
  if (typeof prepared === "string") return prepared;
  const messages: AiMessage[] = [
    {
      role: "system",
      content: agentPrompt(prepared.settings, agency, input.kind, {
        knowledge: prepared.knowledge,
        facts: prepared.facts.words,
        memory: prepared.memory,
        learnings: prepared.learnings,
        voice: prepared.voice,
        natural: prepared.natural,
        instructions: prepared.instructions,
      }),
    },
    asTranscript(prepared.history.messages, input.kind),
  ];
  const ask = async () => {
    const result = await ai.complete({
      feature: "autopilot",
      messages,
      json: true,
      // Room for a thinking model's own tokens too: a cut-off answer is no JSON.
      maxTokens: 2500,
      user: input.organizationId,
    });
    if (!result.ok) return { result, answer: null };
    await db.forOrg(input.organizationId, (tx) =>
      recordTokens(tx, now, prepared.timeZone, { input: result.inputTokens, output: result.outputTokens }),
    );
    return { result, answer: parseAnswer(result.text) };
  };
  let asked = await ask();
  // An answer that isn't readable JSON is asked for once more, as a second call of the month's limit.
  if (asked.result.ok && asked.answer === null) {
    const more = await db.forOrg(input.organizationId, (tx) => reserveAiCall(tx, now, prepared.timeZone));
    if (more) asked = await ask();
  }
  const { result } = asked;
  if (!result.ok || asked.answer === null) {
    // The AI gave nothing to use: the call wasn't one.
    await db.forOrg(input.organizationId, (tx) => releaseAiCall(tx, now, prepared.timeZone));
    return result.ok ? "unreadable" : result.reason;
  }
  const answer = withSettings(asked.answer, prepared.settings, prepared.natural);

  return db.forOrg(input.organizationId, async (tx) => {
    const sendReply = async () => {
      const reply = answer.reply.trim();
      if (reply === "") return null;
      const sent = await queueSystemText(
        tx,
        {
          conversationId: prepared.chat.id,
          body: reply,
          sentBy: null,
          origin: "automation",
          clientToken: `${AI_TOKEN_PREFIX}${input.token}`,
          // Answered by the AI: the chat no longer waits, unless it is handed to a person.
          answers: !answer.handoff,
        },
        now,
      );
      if (sent.ok) {
        await recordAudit(tx, systemActor(input.organizationId), {
          action: "ai.message-sent",
          entityType: "whatsapp_message",
          entityId: sent.messageId,
          after: { kind: input.kind, model: result.model, length: reply.length },
        });
      }
      return sent.ok ? "sent" : sent.code;
    };
    return applyAnswer(tx, {
      organizationId: input.organizationId,
      chat: prepared.chat,
      settings: prepared.settings,
      kind: input.kind,
      answer,
      model: result.model,
      token: input.token,
      sendReply,
      now,
    });
  });
}
