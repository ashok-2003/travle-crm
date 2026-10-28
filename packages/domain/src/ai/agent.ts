// The AI sales agent's turn (the AI sales agent, ADR 0029 as the owner widened it on 2026-10-27 and 2026-10-28): for one
// chat, one call to the model gives the reply to send (or none), whether a person must take the chat or only look at
// it, what to remember, whether and when to follow up, and the lead's insight. Code decides the rest: the reply goes only
// inside the 24-hour window, to someone who hasn't asked to stop, while the agent is on in the chat, no person is
// answering it and the day's count has room; prices and payment details come only from the knowledge, and a booking or a
// payment is confirmed only by a person. Every call's usage is kept.
import { agentAnswer, type AgentAnswer } from "@travel-crm/contracts/ai";
import type { AiMessage, AiModel } from "@travel-crm/integrations/ai";
import type { Database, OrgTx } from "@travel-crm/db";
import { queueSystemText, whatsappConsentOf, windowIsOpen } from "../inbox/index.js";
import { applyAnswer, type ChatFacts } from "./answer-effects.js";
import { personAnsweringUntil } from "./person-pause.js";
import { asTranscript, chatHistory, knowledgePack, leadFactsFor } from "./context.js";
import { activeLessons } from "./learning-store.js";
import { agentPrompt, type TurnKind } from "./prompt.js";
import { aiSettingsOf, type AiSettingsRow } from "./settings.js";
import { chatVoiceOf, naturalIn } from "./voice.js";

export { AI_HANDOFF_KIND } from "./answer-effects.js";
export { agentPrompt, type TurnKind } from "./prompt.js";

export interface AgentDependencies {
  db: Database;
  ai: AiModel;
  /** The agency's name, for the agent to speak for. */
  agencyName: (organizationId: string) => Promise<string>;
}

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
export function cleanReply(text: string, settings: AiSettingsRow): string {
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
function withSettings(answer: AgentAnswer, settings: AiSettingsRow, natural: boolean): AgentAnswer {
  const reply = cleanReply(answer.reply, settings);
  // An everyday conversation never steps back either: there is no team to hand it to.
  if ((settings.handoff !== "alert" && !natural) || !answer.handoff) return { ...answer, reply };
  return {
    ...answer,
    reply,
    handoff: false,
    attention: answer.attention.trim() === "" ? answer.handoffReason : answer.attention,
  };
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
  return (await personAnsweringUntil(tx, chat.id, now)) === null ? null : "person_answering";
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
    const learnings = settings.learning ? await activeLessons(tx) : [];
    const voice = await chatVoiceOf(tx, chat.id);
    const natural = await naturalIn(tx, chat.id, settings);
    // Writing only when nothing stops it; else the same call judges the lead and writes nothing.
    const kind: TurnKind = blocked === null ? input.kind : "insight";
    return { settings, chat, history, memory, facts, knowledge, learnings, voice, natural, kind, blocked };
  });
  if (prepared === null || prepared.history.messages.length === 0) return "nothing";
  const messages: AiMessage[] = [
    {
      role: "system",
      content: agentPrompt(prepared.settings, agency, prepared.kind, {
        knowledge: prepared.knowledge,
        facts: prepared.facts.words,
        memory: prepared.memory,
        learnings: prepared.learnings,
        voice: prepared.voice,
        natural: prepared.natural,
      }),
    },
    asTranscript(prepared.history.messages, prepared.kind),
  ];
  const ask = async () => {
    const result = await ai.complete({
      tier: prepared.kind === "insight" ? "fast" : "chat",
      messages,
      json: true,
      // Room for a thinking model's own tokens too: a cut-off answer is no JSON.
      maxTokens: 2500,
      user: input.organizationId,
    });
    if (!result.ok) return { result, answer: null };
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
    return { result, answer: parseAnswer(result.text) };
  };
  // An answer that isn't readable JSON is asked for once more before the customer goes unanswered.
  let asked = await ask();
  if (asked.result.ok && asked.answer === null) asked = await ask();
  const { result } = asked;
  if (!result.ok) return result.reason;
  if (asked.answer === null) return "unreadable";
  const answer = withSettings(asked.answer, prepared.settings, prepared.natural);

  return db.forOrg(input.organizationId, async (tx) => {
    const sendReply = async () => {
      const reply = answer.reply.trim();
      if (prepared.kind === "insight" || reply === "") return null;
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
      return sent.ok ? "sent" : sent.code;
    };
    return applyAnswer(tx, {
      organizationId: input.organizationId,
      chat: prepared.chat,
      settings: prepared.settings,
      kind: prepared.kind,
      blocked: prepared.blocked,
      leadId: prepared.facts.leadId,
      answer,
      model: result.model,
      token: input.token,
      sendReply,
      now,
    });
  });
}
