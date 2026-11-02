// Fill it for me: the AI reads typed or dictated words, a pasted message, a screenshot, a recording or a chat, and proposes
// values for a form. It proposes, never saves: the proposal goes to the browser, and the form's own save (its own permission,
// plan, lifecycle and audit) is what writes. Three short transactions around the model's answer, as Suggest reply has, so no
// connection waits on the provider: the checks, one monthly call and what the prompt needs; the model; then the fill's row, or
// the call given back when the AI didn't answer or had nothing to fill. The row keeps paths and hashes, never words or values.
import {
  AI_FILL_TEXT_MAX,
  fillTargetPaths,
  type AiFillField,
  type AiFillInput,
  type AiFillProposal,
} from "@travel-crm/contracts/ai";
import { AI_INPUT_RECORD_TYPE } from "@travel-crm/contracts/files";
import type { Database, OrgTx } from "@travel-crm/db";
import type { AiModel, AiPart } from "@travel-crm/integrations/ai";
import { getLead } from "../../crm/index.js";
import type { Files } from "../../files/index.js";
import { organizationTimeZone, type MemberAccess } from "../../identity/index.js";
import { visibleConversation } from "../../inbox/index.js";
import { DomainError, calendarDateIn } from "../../kernel/index.js";
import { getQuote } from "../../quotes/index.js";
import { searchDestinations } from "../../catalog/index.js";
import { aiEnabled } from "../settings.js";
import { MONTHLY_AI_LIMIT, recordTokens, releaseAiCall, reserveAiCall, usedThisMonth } from "../usage.js";
import { callAnswer, leadAnswer, quoteAnswer, tripAnswer } from "@travel-crm/contracts/ai";
import { jsonObjectIn } from "./json.js";
import { fillPrompt, type FillSourceFacts } from "./prompt.js";
import { resolveCall, resolveLead, resolveQuote, type ResolveContext, type Resolved } from "./resolve.js";
import { proposalHash, valueHash } from "./values.js";

const CHAT_MESSAGES = 20;

const refuse = (reason: string, message: string, code: "CONFLICT" | "LIMIT_REACHED" = "CONFLICT") =>
  new DomainError(code, reason, message);

interface Prepared {
  timeZone: string;
  facts: FillSourceFacts;
  from: AiFillField["from"];
  subjectType: "lead" | "quote" | null;
  attachment: { id: string; recordId: string; contentType: string } | null;
  truncated: boolean;
  /** The chat's number, which is the lead's phone when a lead is made from the chat. */
  chatPhone: string | null;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The newest part of a long text, with whether it was cut. */
const newest = (text: string) =>
  text.length <= AI_FILL_TEXT_MAX
    ? { text, truncated: false }
    : { text: text.slice(-AI_FILL_TEXT_MAX), truncated: true };

async function checkSubject(tx: OrgTx, access: MemberAccess, input: AiFillInput): Promise<"lead" | "quote" | null> {
  switch (input.target) {
    case "lead":
      return null;
    case "lead_edit":
    case "call_note":
      if (input.subjectId === undefined) throw new DomainError("VALIDATION", "SUBJECT_REQUIRED", "Say which lead");
      // A lead out of the member's scope is "not found".
      await getLead(tx, access, input.subjectId);
      return "lead";
    case "quote":
      if (input.subjectId === undefined) throw new DomainError("VALIDATION", "SUBJECT_REQUIRED", "Say which quote");
      await getQuote(tx, access, input.subjectId);
      return "quote";
  }
}

async function prepare(tx: OrgTx, access: MemberAccess, input: AiFillInput, now: Date): Promise<Prepared> {
  if (!(await aiEnabled(tx))) {
    throw refuse("AI_OFF", "The AI is off for this agency: an Owner or Admin turns it on in Settings, AI");
  }
  const timeZone = await organizationTimeZone(tx, access.organizationId);
  const subjectType = await checkSubject(tx, access, input);
  const { source } = input;
  let words = source.kind === "text" ? source.text : source.kind === "upload" ? (source.text ?? "") : "";
  let chat: FillSourceFacts["chat"] = [];
  let attachment: Prepared["attachment"] = null;
  let chatPhone: string | null = null;
  let from: Prepared["from"] = "text";
  if (source.kind === "upload") {
    // Only the member's own, finished upload.
    const row = await tx.attachment.findFirst({
      where: { id: source.attachmentId, recordType: AI_INPUT_RECORD_TYPE, createdBy: access.userId, status: "ready" },
      select: { id: true, recordId: true, contentType: true },
    });
    if (row === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
    attachment = row;
    from = row.contentType.startsWith("audio/") ? "voice" : "image";
  } else if (source.kind === "chat") {
    // The member's own scope: a chat they may not see is "not found".
    const conversation = await visibleConversation(tx, access, source.conversationId);
    chatPhone = conversation.phoneE164;
    from = "chat";
    const recent = await tx.whatsappMessage.findMany({
      where: { conversationId: conversation.id, OR: [{ body: { not: null } }, { caption: { not: null } }] },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: CHAT_MESSAGES,
      select: { direction: true, body: true, caption: true },
    });
    chat = recent
      .reverse()
      .map((message) => ({ fromCustomer: message.direction === "in", text: message.body ?? message.caption ?? "" }));
    // Who the chat is with is known: the model needs only the words.
    words = "";
    if (conversation.profileName) words = `The customer's WhatsApp name is ${conversation.profileName}.`;
  }
  const cut = newest(words);
  // One monthly call, taken before the model is asked and given back when it doesn't answer.
  if (!(await reserveAiCall(tx, now, timeZone))) {
    throw refuse("AI_MONTH_LIMIT", "This agency has used this month's AI suggestions", "LIMIT_REACHED");
  }
  const today = calendarDateIn(now, timeZone);
  return {
    timeZone,
    from,
    subjectType,
    attachment,
    truncated: cut.truncated,
    chatPhone,
    facts: {
      today,
      weekday: WEEKDAYS[new Date(`${today}T00:00:00Z`).getUTCDay()] ?? "",
      text: cut.text,
      chat,
      attachments: [],
    },
  };
}

function partOf(bytes: Uint8Array, contentType: string): AiPart {
  if (contentType === "audio/wav") return { type: "audio", format: "wav", bytes };
  if (contentType === "image/jpeg" || contentType === "image/png" || contentType === "image/webp") {
    return { type: "image", mimeType: contentType, bytes };
  }
  throw new DomainError("VALIDATION", "CONTENT_TYPE_NOT_ALLOWED", "This record doesn't take files of this type");
}

/** The answer's text as the target's resolved fields. Null when it was not a JSON object at all. */
async function resolveAnswer(input: AiFillInput, text: string, context: ResolveContext): Promise<Resolved | null> {
  const json = jsonObjectIn(text);
  if (json === null) return null;
  switch (input.target) {
    case "lead":
      return resolveLead(leadAnswer.parse(json), "lead", context);
    case "lead_edit":
      return resolveLead(tripAnswer.parse(json), "lead_edit", context);
    case "call_note":
      return resolveCall(callAnswer.parse(json), context);
    case "quote":
      return resolveQuote(quoteAnswer.parse(json), context);
  }
}

/** Matches a spoken destination to the agency's list: the same name in any case, or one that holds it or is held by it. */
function destinationMatcher(tx: OrgTx) {
  return async (name: string) => {
    const wanted = name.trim().toLowerCase();
    const found = await searchDestinations(tx, { query: name, limit: 5 });
    return (
      found.find((one) => one.name.toLowerCase() === wanted) ??
      found.find((one) => one.name.toLowerCase().includes(wanted) || wanted.includes(one.name.toLowerCase())) ??
      null
    );
  };
}

/**
 * Fills a form. Refused when the AI is off, the lead, quote or chat is not the member's, the recording is not theirs, the month's
 * limit is used, or the AI doesn't answer (the call is then given back). The plan's module and the member's permissions are
 * the router's.
 */
export async function fillForm(
  { db, model, files }: { db: Database; model: AiModel; files: Files },
  access: MemberAccess,
  input: AiFillInput,
  now: Date,
): Promise<AiFillProposal> {
  const { organizationId } = access;
  if (!model.configured) throw refuse("AI_NOT_READY", "The AI isn't set up on this server yet");
  const prepared = await db.forOrg(organizationId, (tx) => prepare(tx, access, input, now));
  const giveBack = () => db.forOrg(organizationId, (tx) => releaseAiCall(tx, now, prepared.timeZone));
  let attachments: AiPart[] = [];
  try {
    if (prepared.attachment !== null) {
      const file = await files.systemFile(organizationId, {
        recordType: AI_INPUT_RECORD_TYPE,
        recordId: prepared.attachment.recordId,
        attachmentId: prepared.attachment.id,
      });
      attachments = [partOf(file.body, prepared.attachment.contentType)];
    }
  } catch (error) {
    await giveBack();
    throw error;
  }
  const result = await model.complete({
    feature: "fill_form",
    messages: fillPrompt(input.target, { ...prepared.facts, attachments }),
    json: true,
    maxTokens: 2500,
    // Opaque: the agency's id, never a person's.
    user: organizationId,
  });
  if (!result.ok) {
    await giveBack();
    throw result.reason === "rate_limited"
      ? refuse("AI_BUSY", "The AI is busy right now")
      : result.reason === "not_configured"
        ? refuse("AI_NOT_READY", "The AI isn't set up on this server yet")
        : refuse("AI_UNAVAILABLE", "The AI didn't answer");
  }
  const saved = await db.forOrg(organizationId, async (tx) => {
    const resolved = await resolveAnswer(input, result.text, {
      today: prepared.facts.today,
      from: prepared.from,
      matchDestination: destinationMatcher(tx),
    });
    const allowed: readonly string[] = fillTargetPaths[input.target];
    const fields = (resolved?.fields ?? []).filter((field) => allowed.includes(field.path));
    // A chat's number is the lead's phone, as the chat has it: not the model's reading of it.
    if (input.target === "lead" && prepared.chatPhone !== null) {
      const own = fields.findIndex((field) => field.path === "person.phone");
      if (own >= 0) fields.splice(own, 1);
      fields.unshift({ path: "person.phone", value: prepared.chatPhone, from: "chat", excerpt: "" });
    }
    const questions = resolved?.questions ?? [];
    // Nothing usable (a silent recording, a picture with no words) is not a call.
    if (resolved === null || (fields.length === 0 && questions.length === 0)) {
      await releaseAiCall(tx, now, prepared.timeZone);
      return null;
    }
    await recordTokens(tx, now, prepared.timeZone, { input: result.inputTokens, output: result.outputTokens });
    const row = await tx.aiFill.create({
      data: {
        target: input.target,
        subjectType: prepared.subjectType,
        subjectId: input.subjectId ?? null,
        requestedBy: access.userId,
        inputKind: prepared.from,
        inputAttachmentId: prepared.attachment?.id ?? null,
        model: result.model,
        proposalHash: proposalHash(fields),
        fields: fields.map((field) => field.path),
        fieldHashes: Object.fromEntries(fields.map((field) => [field.path, valueHash(field.path, field.value)])),
      },
      select: { id: true },
    });
    return { fillId: row.id, fields, questions, usedThisMonth: await usedThisMonth(tx, now, prepared.timeZone) };
  });
  if (saved === null) throw refuse("AI_NOTHING_TO_FILL", "The AI found nothing to fill in what it was given");
  return { ...saved, truncated: prepared.truncated, monthlyLimit: MONTHLY_AI_LIMIT };
}
