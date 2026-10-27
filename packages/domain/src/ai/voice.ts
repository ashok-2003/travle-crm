// The AI writes as a real person writes (the owner, 2026-10-28): from one person's own WhatsApp messages (an export the
// browser read; only that person's lines are sent, with numbers, emails and links taken out), the model writes a style
// guide of how they talk and picks a few of their messages that show it. Kept for the whole agency or for one chat,
// where it wins over the agency's; never the export itself. The agent then writes as them, its sales rules unchanged.
import { voiceAnswer, type AiVoice, type LearnVoiceInput } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import type { LearnDependencies } from "./learning.js";
import { scrubbed } from "./scrub.js";

/** A way of talking as the prompt takes it. */
export interface Voice {
  name: string;
  profile: string;
  examples: string[];
}

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
  return `You study how one person writes on WhatsApp, so that an assistant can write exactly like them. The user message holds ${name}'s own messages from a chat, oldest first.

Write a style guide of ${name} (under 2500 characters), concrete and with short quoted phrases:
- languages and script (Hinglish in Latin letters, Hindi in Devanagari, English...), and how they mix them
- spelling, short forms and typos they make on purpose ("hn", "kr", "plz", "thnx")
- message length, and whether they split a thought into several short messages
- capitals and punctuation ("...", "!!", "??", no full stops)
- emojis: which ones, how often, where in the message
- greetings, sign-offs, fillers, favourite words and how they address people (ji, bhai, sir, dear)
- tone and humour, and how they show feelings: excitement, care, apology, impatience
Then pick the 25 messages that show their style best, exactly as written. Leave out any with a name, a number, an email or an address.

Answer with ONE JSON object and nothing else: {"profile": string, "examples": [string]}`;
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
  const lines = input.messages.map((message) => scrubbed(message));
  const result = await ai.complete({
    tier: "chat",
    json: true,
    maxTokens: 3000,
    user: access.organizationId,
    messages: [
      { role: "system", content: voicePrompt(input.personName) },
      { role: "user", content: lines.join("\n") },
    ],
  });
  if (!result.ok) throw new DomainError("CONFLICT", "AI_UNAVAILABLE", "The AI did not answer; try again");
  const parsed = readJson(result.text);
  if (parsed === null) throw new DomainError("CONFLICT", "AI_UNAVAILABLE", "The AI did not answer; try again");
  const voice = {
    voiceName: input.personName,
    voiceProfile: parsed.profile,
    // Only their real messages: an example the model made up would teach a voice that isn't theirs.
    voiceExamples: [
      ...new Set(
        parsed.examples
          .map((example) => scrubbed(example).trim())
          .filter((one) => one !== "" && lines.some((line) => line.includes(one))),
      ),
    ],
  };
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
        create: { conversationId: input.conversationId, ...voice },
        update: voice,
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
  else await tx.aiChat.updateMany({ where: { conversationId }, data: none });
  await recordAudit(tx, access, {
    action: "ai.voice-removed",
    entityType: conversationId === undefined ? "ai_settings" : "whatsapp_conversation",
    entityId: conversationId ?? access.organizationId,
  });
}

const voiceOf = (row: { voiceName: string | null; voiceProfile: string | null; voiceExamples: string[] } | null) =>
  row?.voiceName == null || row.voiceProfile == null
    ? null
    : { name: row.voiceName, profile: row.voiceProfile, examples: row.voiceExamples };

const voiceColumns = { voiceName: true, voiceProfile: true, voiceExamples: true } as const;

/** The agency's way of talking, if one was given. */
export async function agencyVoiceOf(tx: OrgTx): Promise<Voice | null> {
  return voiceOf(await tx.aiSettings.findFirst({ select: voiceColumns }));
}

/** The way of talking in one chat: its own, else the agency's; and whether it is the chat's own. */
export async function chatVoiceOf(tx: OrgTx, conversationId: string): Promise<(Voice & { own: boolean }) | null> {
  const own = voiceOf(await tx.aiChat.findFirst({ where: { conversationId }, select: voiceColumns }));
  if (own !== null) return { ...own, own: true };
  const agency = await agencyVoiceOf(tx);
  return agency === null ? null : { ...agency, own: false };
}
