// The AI writes as a real person writes (the owner, 2026-10-28): from a WhatsApp chat export the browser read (both
// sides, in order, with numbers, emails and links taken out), the model writes a style guide of how the chosen person
// talks, picks a few of their own messages that show it, and, for one chat, writes down what the two talked about
// before (who the other is, topics, plans, likes, how each of them writes) and keeps the chat's last messages from both
// sides, read with every reply. Kept for the whole agency or for one chat, where it wins over the agency's. The agent
// then writes as them; it never denies being an AI when asked.
import { voiceAnswer, type AiVoice, type LearnVoiceInput } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import type { LearnDependencies } from "./learning.js";
import { scrubbed } from "./scrub.js";
import type { AiSettingsRow } from "./settings.js";

/** A way of talking as the prompt takes it. */
export interface Voice {
  name: string;
  profile: string;
  examples: string[];
  /** What the two talked about before, from this chat's imported export; null for the agency's voice. */
  context: string | null;
  /** The imported chat's last messages, both sides, oldest first; empty for the agency's voice. */
  history: { own: boolean; text: string }[];
}

/** Imported messages a chat keeps, and the length of each, so every reply can read them. */
const HISTORY_KEPT = 100;
const HISTORY_CHARACTERS = 400;

const notFound = () => new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");

/** The model's answer as JSON, read leniently; null when it holds no readable style guide. */
function readJson(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = voiceAnswer.safeParse(JSON.parse(text.slice(start, end + 1)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function voicePrompt(name: string) {
  return `You study how one person writes on WhatsApp, so that an assistant can write exactly like them and carry the conversation on. The user message is a chat, oldest first: lines from ${name} start "${name}:", the other side's start "Them:".

Write a style guide of ${name} (under 2500 characters), concrete and with short quoted phrases:
- languages and script (Hinglish in Latin letters, Hindi in Devanagari, English...), and how they mix them
- spelling, short forms and typos they make on purpose ("hn", "kr", "plz", "thnx")
- message length, and whether they split a thought into several short messages
- capitals and punctuation ("...", "!!", "??", no full stops)
- emojis: which ones, how often, where in the message
- greetings, sign-offs, fillers, favourite words and how they address people (ji, bhai, sir, dear)
- tone and humour, and how they show feelings: excitement, care, apology, impatience
Then pick the 25 of ${name}'s messages that show their style best, exactly as written. Leave out any with a name, a number, an email or an address.
Then write the context (under 3500 characters), from the whole chat, so the next reply follows on as if no time had passed: who the other person is to ${name} and how close they are; what they talk about most; the important things said (events, places, dates, decisions, promises, plans still open); what the other person likes, dislikes, worries about and is going through; how the other person writes and what makes them happy or annoyed; their shared jokes, nicknames and references; and how the two usually reply to each other.

Answer with ONE JSON object and nothing else: {"profile": string, "examples": [string], "context": string}`;
}

/** Reads one person's way of talking and keeps it, for the agency or one chat. */
export async function learnVoice(
  dependencies: LearnDependencies,
  access: MemberAccess,
  input: LearnVoiceInput,
): Promise<AiVoice> {
  const { db, ai } = dependencies;
  if (!ai.configured)
    throw new DomainError("FEATURE_LOCKED", "AI_NOT_CONFIGURED", "The AI assistant is not set up on this platform");
  if (input.conversationId !== undefined) {
    const chatId = input.conversationId;
    const chat = await db.forOrg(access.organizationId, (tx) =>
      tx.whatsappConversation.findUnique({ where: { id: chatId }, select: { id: true } }),
    );
    if (chat === null) throw notFound();
  }
  const chat = input.messages.map((message) => ({ own: message.own, text: scrubbed(message.text) }));
  const theirs = chat.filter((message) => message.own).map((message) => message.text);
  const ask = () =>
    ai.complete({
      tier: "chat",
      json: true,
      // Room for a thinking model's own tokens too: a cut-off answer is no JSON.
      maxTokens: 6000,
      user: access.organizationId,
      messages: [
        { role: "system", content: voicePrompt(input.personName) },
        {
          role: "user",
          content: chat.map((message) => `${message.own ? input.personName : "Them"}: ${message.text}`).join("\n"),
        },
      ],
    });
  // An answer that isn't readable is asked for once more before the person is told to try again.
  let result = await ask();
  let parsed = result.ok ? readJson(result.text) : null;
  if (result.ok && parsed === null) {
    result = await ask();
    parsed = result.ok ? readJson(result.text) : null;
  }
  if (!result.ok || parsed === null)
    throw new DomainError("CONFLICT", "AI_UNAVAILABLE", "The AI did not answer; try again");
  const voice = {
    voiceName: input.personName,
    voiceProfile: parsed.profile,
    // Only their real messages: an example the model made up would teach a voice that isn't theirs.
    voiceExamples: [
      ...new Set(
        parsed.examples
          .map((example) => scrubbed(example).trim())
          .filter((one) => one !== "" && theirs.some((line) => line.includes(one))),
      ),
    ],
  };
  // What the two talked about belongs to one chat; the agency's voice is a way of talking alone.
  const context = scrubbed(parsed.context).trim().slice(0, 4000);
  const history = chat.slice(-HISTORY_KEPT).map((message) => ({
    own: message.own,
    text: message.text.slice(0, HISTORY_CHARACTERS),
  }));
  return db.forOrg(access.organizationId, async (tx) => {
    await tx.aiUsage.create({
      data: { kind: "learn", model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens },
    });
    if (input.conversationId === undefined) {
      const row = await tx.aiSettings.findFirst({ select: { organizationId: true } });
      if (row === null) await tx.aiSettings.create({ data: voice });
      else await tx.aiSettings.update({ where: { organizationId: row.organizationId }, data: voice });
    } else {
      await tx.aiChat.upsert({
        where: {
          organizationId_conversationId: {
            organizationId: access.organizationId,
            conversationId: input.conversationId,
          },
        },
        create: {
          conversationId: input.conversationId,
          ...voice,
          voiceContext: context || null,
          voiceHistory: history,
        },
        update: { ...voice, voiceContext: context || null, voiceHistory: history },
      });
    }
    await recordAudit(tx, access, {
      action: "ai.voice-learned",
      entityType: input.conversationId === undefined ? "ai_settings" : "whatsapp_conversation",
      entityId: input.conversationId ?? access.organizationId,
    });
    return { name: voice.voiceName, profile: voice.voiceProfile, examples: voice.voiceExamples.length };
  });
}

/** The agent talks its own way again: for the agency, or in one chat (which then follows the agency's). */
export async function clearVoice(tx: OrgTx, access: MemberAccess, conversationId: string | undefined): Promise<void> {
  const none = { voiceName: null, voiceProfile: null, voiceExamples: [] };
  if (conversationId === undefined) await tx.aiSettings.updateMany({ data: none });
  else
    await tx.aiChat.updateMany({ where: { conversationId }, data: { ...none, voiceContext: null, voiceHistory: [] } });
  await recordAudit(tx, access, {
    action: "ai.voice-removed",
    entityType: conversationId === undefined ? "ai_settings" : "whatsapp_conversation",
    entityId: conversationId ?? access.organizationId,
  });
}

interface VoiceRow {
  voiceName: string | null;
  voiceProfile: string | null;
  voiceExamples: string[];
  voiceContext?: string | null;
  voiceHistory?: unknown;
}

/** The stored history read back: lines that aren't { own, text } are dropped. */
function historyOf(stored: unknown): { own: boolean; text: string }[] {
  if (!Array.isArray(stored)) return [];
  return stored.flatMap((line: unknown) =>
    typeof line === "object" &&
    line !== null &&
    "own" in line &&
    "text" in line &&
    typeof line.own === "boolean" &&
    typeof line.text === "string"
      ? [{ own: line.own, text: line.text }]
      : [],
  );
}

const voiceOf = (row: VoiceRow | null): Voice | null =>
  row?.voiceName == null || row.voiceProfile == null
    ? null
    : {
        name: row.voiceName,
        profile: row.voiceProfile,
        examples: row.voiceExamples,
        context: row.voiceContext ?? null,
        history: historyOf(row.voiceHistory),
      };

const voiceColumns = { voiceName: true, voiceProfile: true, voiceExamples: true } as const;

/** The agency's way of talking, if one was given. */
export async function agencyVoiceOf(tx: OrgTx): Promise<Voice | null> {
  return voiceOf(await tx.aiSettings.findFirst({ select: voiceColumns }));
}

/** The way of talking in one chat: its own, else the agency's; and whether it is the chat's own. */
export async function chatVoiceOf(tx: OrgTx, conversationId: string): Promise<(Voice & { own: boolean }) | null> {
  const own = voiceOf(
    await tx.aiChat.findFirst({
      where: { conversationId },
      select: { ...voiceColumns, voiceContext: true, voiceHistory: true },
    }),
  );
  if (own !== null) return { ...own, own: true };
  const agency = await agencyVoiceOf(tx);
  return agency === null ? null : { ...agency, own: false };
}

/** Whether a chat is an everyday conversation, not a sale: the chat's own choice, else the agency's. */
export async function naturalIn(tx: OrgTx, conversationId: string, settings: AiSettingsRow): Promise<boolean> {
  const chat = await tx.aiChat.findFirst({ where: { conversationId }, select: { persona: true } });
  return chat?.persona === "natural" || (chat?.persona !== "sales" && settings.persona === "natural");
}

/** One chat's AI is a sales agent, an everyday conversation, or as the agency says; audited. */
export async function setChatPersona(
  tx: OrgTx,
  access: MemberAccess,
  input: { conversationId: string; persona: "default" | "sales" | "natural" },
): Promise<void> {
  const chat = await tx.whatsappConversation.findUnique({ where: { id: input.conversationId }, select: { id: true } });
  if (chat === null) throw notFound();
  const before = await tx.aiChat.upsert({
    where: {
      organizationId_conversationId: { organizationId: access.organizationId, conversationId: input.conversationId },
    },
    create: { conversationId: input.conversationId },
    update: {},
    select: { id: true, persona: true },
  });
  await tx.aiChat.update({ where: { id: before.id }, data: { persona: input.persona } });
  await recordAudit(tx, access, {
    action: "ai.chat-persona-changed",
    entityType: "whatsapp_conversation",
    entityId: input.conversationId,
    before: { persona: before.persona },
    after: { persona: input.persona },
  });
}
