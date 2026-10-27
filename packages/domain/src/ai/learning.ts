// How the AI sales agent learns (the owner, 2026-10-28: "it reads every chat and learns what people want and how to
// talk to them"): the agency's recent chats, each with how its lead ended (booked, lost and why, still open), go to the
// model with the lessons already kept; it answers with lessons, new or sharpened, about what customers want, what wins a
// booking, the objections and the answers that work, how to speak, and the questions asked most. Lessons are general:
// names, numbers and addresses are taken out of the chats before they leave, and the model is told to keep none. The
// owner's turned-off lessons stay off. Each night for every agency that learns, and when the owner asks.
import { learnAnswer } from "@travel-crm/contracts/ai";
import type { AiModel } from "@travel-crm/integrations/ai";
import type { Database, OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { aiSettingsOf } from "./settings.js";

const LOOK_BACK_MS = 21 * 86_400_000;
const CHATS = 30;
/** Fewer chats than this teach nothing worth keeping. */
const MIN_CHATS = 2;
const MESSAGES_PER_CHAT = 16;
const CHAT_CHARACTERS = 1200;
/** Active lessons kept at most; past it the least supported are dismissed. */
const MOST_LESSONS = 30;
/** The owner's "Learn now" waits this long after the last time. */
const AGAIN_AFTER_MS = 10 * 60_000;

export interface LearnDependencies {
  db: Database;
  ai: AiModel;
  agencyName: (organizationId: string) => Promise<string>;
}

/** A chat's words without what names one person: long numbers, emails, links. */
const scrubbed = (text: string) =>
  text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]")
    .replace(/https?:\/\/\S+/g, "[link]")
    .replace(/\+?\d[\d\s-]{6,}\d/g, "[number]");

async function transcripts(tx: OrgTx, now: Date): Promise<string[]> {
  const chats = await tx.whatsappConversation.findMany({
    where: { lastInboundAt: { gte: new Date(now.getTime() - LOOK_BACK_MS) } },
    orderBy: { lastInboundAt: "desc" },
    take: CHATS,
    select: { id: true, personId: true },
  });
  const out: string[] = [];
  for (const chat of chats) {
    const rows = await tx.whatsappMessage.findMany({
      where: { conversationId: chat.id, kind: { in: ["text", "template"] } },
      orderBy: { occurredAt: "desc" },
      take: MESSAGES_PER_CHAT,
      select: { direction: true, body: true },
    });
    if (rows.length < 2) continue;
    const lead =
      chat.personId === null
        ? null
        : await tx.lead.findFirst({
            where: { personId: chat.personId },
            orderBy: { createdAt: "desc" },
            select: { stage: true, lostReason: true },
          });
    const outcome =
      lead === null
        ? "no lead"
        : lead.stage === "lost"
          ? `lost${lead.lostReason === null ? "" : ` (${lead.lostReason})`}`
          : lead.stage === "won"
            ? "booked"
            : `open, stage ${lead.stage}`;
    const lines = [...rows]
      .reverse()
      .map((row) => `${row.direction === "in" ? "Customer" : "Us"}: ${scrubbed(row.body ?? "")}`)
      .join("\n")
      .slice(-CHAT_CHARACTERS);
    out.push(`### Chat ${String(out.length + 1)} (outcome: ${outcome})\n${lines}`);
  }
  return out;
}

/** The agency's settings say when it last learned (a row is made with the defaults if it has none). */
async function stampLearned(tx: OrgTx, now: Date) {
  const row = await tx.aiSettings.findFirst({ select: { organizationId: true } });
  if (row === null) await tx.aiSettings.create({ data: { learnedAt: now } });
  else await tx.aiSettings.update({ where: { organizationId: row.organizationId }, data: { learnedAt: now } });
}

function lessonPrompt(agency: string, existing: { id: string; kind: string; text: string; evidence: number }[]) {
  return `You coach the WhatsApp sales team of ${agency}, an Indian travel agency. Read their recent chats (each with how it ended) and write the lessons that will help their AI sales agent book more trips.

Lessons are short (under 200 characters), practical and general. Kinds:
- need: what customers want or ask for (destinations, months, budgets, group types)
- winning: what our side did in chats that booked
- objection: an objection customers raise and the answer that worked
- style: how to talk to these customers (language, length, tone) that got replies
- faq: a question asked often, with the answer from the chats

Never write a name, a phone number, an email, an address or anything about one person. Count evidence as the number of chats that show the lesson. Each lesson says something the others don't: merge two that say the same thing in other words.
Keep each lesson below that is still true: return it with its id, sharpened if you can, and its evidence updated. Add new ones without an id. At most 20 lessons in all; drop the weak.

Lessons kept so far:
${existing.length === 0 ? "(none)" : existing.map((one) => `- id ${one.id} [${one.kind}, ${String(one.evidence)}] ${one.text}`).join("\n")}

Answer with ONE JSON object and nothing else: {"learnings": [{"id": string|null, "kind": "need"|"winning"|"objection"|"style"|"faq", "text": string, "evidence": integer}]}`;
}

/** One agency's lesson run. Returns how many lessons were added and sharpened. */
export async function learnFromChats(
  dependencies: LearnDependencies,
  organizationId: string,
  now: Date,
): Promise<{ added: number; updated: number }> {
  const { db, ai } = dependencies;
  const none = { added: 0, updated: 0 };
  if (!ai.configured) return none;
  const prepared = await db.forOrg(organizationId, async (tx) => ({
    chats: await transcripts(tx, now),
    existing: await tx.aiLearning.findMany({
      where: { state: { in: ["active", "off"] } },
      orderBy: { evidence: "desc" },
      take: 40,
      select: { id: true, kind: true, text: true, evidence: true, state: true },
    }),
  }));
  if (prepared.chats.length < MIN_CHATS) {
    await db.forOrg(organizationId, (tx) => stampLearned(tx, now));
    return none;
  }
  const agency = await dependencies.agencyName(organizationId);
  const result = await ai.complete({
    tier: "chat",
    json: true,
    maxTokens: 2000,
    user: organizationId,
    messages: [
      { role: "system", content: lessonPrompt(agency, prepared.existing) },
      { role: "user", content: prepared.chats.join("\n\n") },
    ],
  });
  if (!result.ok) return none;
  const start = result.text.indexOf("{");
  const end = result.text.lastIndexOf("}");
  let lessons: ReturnType<typeof learnAnswer.parse>["learnings"] = [];
  try {
    lessons = start === -1 ? [] : learnAnswer.parse(JSON.parse(result.text.slice(start, end + 1))).learnings;
  } catch {
    lessons = [];
  }
  const known = new Map(prepared.existing.map((one) => [one.id, one]));
  return db.forOrg(organizationId, async (tx) => {
    await tx.aiUsage.create({
      data: { kind: "learn", model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens },
    });
    let added = 0;
    let updated = 0;
    for (const lesson of lessons) {
      const text = scrubbed(lesson.text).trim().slice(0, 400);
      if (text === "") continue;
      const before = lesson.id === null ? undefined : known.get(lesson.id);
      if (before !== undefined) {
        // The owner's switch wins: a turned-off lesson stays off, and is not rewritten.
        if (before.state === "off") continue;
        await tx.aiLearning.update({
          where: { id: before.id },
          data: { kind: lesson.kind, text, evidence: Math.max(before.evidence, lesson.evidence) },
        });
        updated += 1;
      } else {
        await tx.aiLearning.create({ data: { kind: lesson.kind, text, evidence: lesson.evidence } });
        added += 1;
      }
    }
    const active = await tx.aiLearning.findMany({
      where: { state: "active" },
      orderBy: [{ evidence: "desc" }, { updatedAt: "desc" }],
      select: { id: true },
    });
    const surplus = active.slice(MOST_LESSONS).map((one) => one.id);
    if (surplus.length > 0)
      await tx.aiLearning.updateMany({ where: { id: { in: surplus } }, data: { state: "dismissed" } });
    await stampLearned(tx, now);
    return { added, updated };
  });
}

/** The owner's "Learn now": refused while the AI is off or it learned a moment ago; audited. */
export async function learnNow(
  dependencies: LearnDependencies,
  access: MemberAccess,
  now: Date,
): Promise<{ added: number; updated: number }> {
  if (!dependencies.ai.configured)
    throw new DomainError("FEATURE_LOCKED", "AI_NOT_CONFIGURED", "The AI assistant is not set up on this platform");
  const settings = await dependencies.db.forOrg(access.organizationId, (tx) => aiSettingsOf(tx));
  if (settings.learnedAt !== null && now.getTime() - settings.learnedAt.getTime() < AGAIN_AFTER_MS)
    throw new DomainError("CONFLICT", "AI_LEARNED_RECENTLY", "The AI learned a few minutes ago");
  const outcome = await learnFromChats(dependencies, access.organizationId, now);
  await dependencies.db.forOrg(access.organizationId, (tx) =>
    recordAudit(tx, access, {
      action: "ai.learned",
      entityType: "ai_settings",
      entityId: access.organizationId,
      after: outcome,
    }),
  );
  return outcome;
}
