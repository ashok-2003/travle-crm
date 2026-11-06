// The autopilot's turn (AI step 2; ADR 0029 as the owner widened it on 2026-10-27 and 2026-10-28): for one chat, one call to
// the model gives the reply to send (or none), whether a person must take the chat or only look at it, what to remember
// and whether and when to follow up. Code decides the rest: the agency must have the AI and the autopilot on, its plan and
// subscription must allow the AI, and the shared monthly limit must have room; the reply goes only inside the 24-hour
// window, never to someone who asked to stop (in a chat with no person linked too), while the autopilot is on in the chat,
// no person is answering it and the day's count has room; prices and payment details come only from the knowledge, and a
// booking or a payment is confirmed only by a person. Every message it sends is marked as the AI's in the chat
// (clientToken "ai:...") and audited; every call's tokens are kept. After the words go the agency's payment details
// (exactly as it wrote them) when the AI says so, then the media it chose; a yes from the customer becomes a booking.
import { agentAnswer, type AgentAnswer } from "@travel-crm/contracts/ai";
import type { AiMessage, AiModel } from "@travel-crm/integrations/ai";
import type { Database } from "@travel-crm/db";
import type { Logger } from "@travel-crm/integrations/logging";
import { recordAudit } from "../audit/index.js";
import type { Files } from "../files/index.js";
import { organizationTimeZone } from "../identity/index.js";
import { queueSystemText } from "../inbox/index.js";
import { systemActor } from "../kernel/index.js";
import type { SubscriptionAccess } from "../subscriptions/index.js";
import { aiAllowed } from "./allowed.js";
import { agentPrompt, fenced, type TurnKind } from "./agent-prompt.js";
import { applyAnswer } from "./agent-effects.js";
import { asTranscript, chatHistory, knowledgePack, leadFactsFor } from "./agent-context.js";
import { autopilotOf, type AutopilotRow } from "./autopilot.js";
import { openBookingOf, takeBooking, type BookingRecipients } from "./booking.js";
import { mediaForPrompt, sendChosenMedia } from "./media.js";
import { activeLessons } from "./learning-store.js";
import { cleanReply } from "./clean-reply.js";
import { AI_TOKEN_PREFIX, agentAnswers, mayWrite } from "./may-write.js";
import { aiEnabled } from "./settings.js";
import { runGroundedTurn } from "./grounded/turn.js";
import { recordTokens, releaseAiCall, reserveAiCall } from "./usage.js";
import { calendarText, dateChecks, fixWeekdays } from "./calendar.js";
import { chatVoiceOf } from "./chat-voice.js";
import { repeatsEarlier } from "./repeats.js";
import { naturalIn } from "./voice.js";
import { PAYMENT_DETAILS_TOKEN } from "./payment-likely.js";

export { AI_HANDOFF_KIND } from "./agent-effects.js";
export { AI_TOKEN_PREFIX, agentAnswers, cleanReply, mayWrite };

export interface AgentDependencies {
  db: Database;
  ai: AiModel;
  subscriptions: Pick<SubscriptionAccess, "entitlementsOf">;
  /** The agency's name, for the AI to speak for. */
  agencyName: (organizationId: string) => Promise<string>;
  /** Where the agency's media is kept, to send it. */
  files: Files;
  /** The agency's managers, told of every booking the AI takes. */
  managers: BookingRecipients;
  /** Where the grounded turn logs its outcome (codes only); the worker passes its own. */
  logger?: Logger;
}

/** The messages sent in the chat that a reply is checked against for a repeat. */
const RECENT_SENT = 10;
/** The team's note when the AI's reply only said again what was sent, so nothing went. */
const REPEAT_ATTENTION = "The AI's reply repeated an earlier message, so it wasn't sent: please answer this customer.";

/** Asks again for a reply that doesn't say again what was sent. */
const repeatCorrection = (reply: string) =>
  `Your reply repeats a message already sent in this chat:\n<data>${fenced(reply)}</data>\nWrite a different reply that answers their last message in new words and moves the chat forward, as the same ONE JSON object.`;

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

/**
 * One turn of the AI in a chat: `reply` to the customer's last message, `nudge` a quiet one, or write about a `followUp`
 * on the lead that came due. Returns what happened, for the log. Safe to run twice: a reply's token is the message it
 * answers.
 */
export async function runAgentTurn(
  dependencies: AgentDependencies,
  input: {
    organizationId: string;
    conversationId: string;
    kind: TurnKind;
    token: string;
    /** What the follow-up that came due is about, for a `followUp` turn. */
    followUp?: string;
  },
  now: Date,
): Promise<string> {
  const { db, ai } = dependencies;
  if (!ai.configured) return "not_configured";
  // No AI for an agency whose plan lacks it or whose subscription is read-only, suspended or cancelled.
  if (!aiAllowed(await dependencies.subscriptions.entitlementsOf(input.organizationId))) return "not_allowed";
  // An agency switched to the grounded turn gets it; the others keep this agent exactly as it is.
  const grounded = await db.forOrg(
    input.organizationId,
    async (tx) => (await aiEnabled(tx)) && (await autopilotOf(tx)).grounded,
  );
  if (grounded) return runGroundedTurn(dependencies, input, now);
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
    // The AI's own last messages, so a reply that says them again is caught.
    const sent = await tx.whatsappMessage.findMany({
      where: { conversationId: chat.id, direction: "out", body: { not: null } },
      orderBy: { occurredAt: "desc" },
      take: RECENT_SENT,
      select: { body: true },
    });
    const lastTurn = history.messages.at(-1);
    const paymentSent =
      (await tx.whatsappMessage.findFirst({
        where: { conversationId: chat.id, clientToken: { startsWith: PAYMENT_DETAILS_TOKEN } },
        select: { id: true },
      })) !== null;
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
      sent: sent.map((row) => row.body ?? ""),
      calendar: calendarText(now, timeZone),
      // The customer's own last words, read for a date that is wrong; a nudge or a follow-up answers nothing they said.
      dateChecks:
        input.kind === "reply" && lastTurn?.role === "user" ? dateChecks(lastTurn.content, now, timeZone) : [],
      media: settings.sendMedia ? await mediaForPrompt(tx, chat.id) : [],
      paymentSent,
      bookingOpen: facts.leadId !== null && (await openBookingOf(tx, facts.leadId)) !== null,
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
        media: prepared.media,
        paymentSent: prepared.paymentSent,
        bookingOpen: prepared.bookingOpen,
        followUp: input.followUp ?? null,
        calendar: prepared.calendar,
        dateChecks: prepared.dateChecks,
      }),
    },
    asTranscript(prepared.history.messages, input.kind),
  ];
  const ask = async (correction?: string) => {
    const result = await ai.complete({
      feature: "autopilot",
      messages: correction === undefined ? messages : [...messages, { role: "user", content: correction }],
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
  // A reply that says again what was sent already is asked for once more, the repeat named; repeated again, it isn't sent
  // and the team is asked to answer.
  let repeated = false;
  if (asked.answer !== null && repeatsEarlier(asked.answer.reply, prepared.sent)) {
    const more = await db.forOrg(input.organizationId, (tx) => reserveAiCall(tx, now, prepared.timeZone));
    if (more) {
      const again = await ask(repeatCorrection(asked.answer.reply));
      if (again.result.ok && again.answer !== null) asked = again;
      else await db.forOrg(input.organizationId, (tx) => releaseAiCall(tx, now, prepared.timeZone));
    }
    repeated = asked.answer !== null && repeatsEarlier(asked.answer.reply, prepared.sent);
  }
  const { result } = asked;
  if (!result.ok || asked.answer === null) {
    // The AI gave nothing to use: the call wasn't one.
    await db.forOrg(input.organizationId, (tx) => releaseAiCall(tx, now, prepared.timeZone));
    return result.ok ? "unreadable" : result.reason;
  }
  const settled = withSettings(asked.answer, prepared.settings, prepared.natural);
  // A weekday the AI wrote beside a date is that date's own, whatever the model worked out.
  const answer = repeated
    ? { ...settled, reply: "", attention: settled.attention.trim() === "" ? REPEAT_ATTENTION : settled.attention }
    : { ...settled, reply: fixWeekdays(settled.reply, now, prepared.timeZone) };

  const booking = answer.booking.confirmed && !prepared.natural;
  const managers = booking ? await dependencies.managers(input.organizationId) : [];
  const outcome = await db.forOrg(input.organizationId, async (tx) => {
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
      if (!sent.ok) return sent.code;
      // The payment details as the agency wrote them, never as the model would type them.
      const details = prepared.settings.paymentDetails.trim();
      if (answer.sendPaymentDetails && details !== "" && !prepared.natural) {
        const paid = await queueSystemText(
          tx,
          {
            conversationId: prepared.chat.id,
            body: details,
            sentBy: null,
            origin: "automation",
            clientToken: `${PAYMENT_DETAILS_TOKEN}${input.token}`,
            answers: !answer.handoff,
          },
          now,
        );
        if (paid.ok) {
          await recordAudit(tx, systemActor(input.organizationId), {
            action: "ai.message-sent",
            entityType: "whatsapp_message",
            entityId: paid.messageId,
            after: { kind: "payment-details", model: result.model, length: details.length },
          });
        }
      }
      return "sent";
    };
    const done = await applyAnswer(tx, {
      organizationId: input.organizationId,
      chat: prepared.chat,
      settings: prepared.settings,
      kind: input.kind,
      answer,
      model: result.model,
      token: input.token,
      leadId: prepared.facts.leadId,
      sendReply,
      now,
    });
    if (booking) {
      await takeBooking(tx, {
        organizationId: input.organizationId,
        conversationId: prepared.chat.id,
        leadId: prepared.facts.leadId,
        booking: answer.booking,
        recipients: managers,
        now,
      });
    }
    return done;
  });
  // The media it chose, each as a message of its own after the words, once the reply went.
  const replied = outcome === "replied" || outcome === "replied_flagged" || outcome === "handed_off";
  if (replied && prepared.media.length > 0 && answer.media.length > 0) {
    const chosen = prepared.media.filter((one) => answer.media.some((code) => code.trim().toUpperCase() === one.code));
    await sendChosenMedia(
      dependencies,
      { organizationId: input.organizationId, conversationId: prepared.chat.id, chosen, token: input.token },
      now,
    );
  }
  return outcome;
}
