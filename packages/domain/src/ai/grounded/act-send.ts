// Sends a checked reply, then its files, then the payment QR and the payment text: each a message of the AI's, its token
// made from the turn's, so a repeat of the turn sends none of them twice. A refusal throws, so the whole turn rolls back.
import {
  AI_MEDIA_RECORD_TYPE,
  PACKAGE_BROCHURE_RECORD_TYPE,
  PACKAGE_PAYMENT_QR_RECORD_TYPE,
  WHATSAPP_RECORD_TYPE,
} from "@travel-crm/contracts/files";
import { MAX_AI_MEDIA_PER_REPLY } from "@travel-crm/contracts/ai";
import type { AttachmentRefInput } from "@travel-crm/contracts/files";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../../audit/index.js";
import { kindOf, queueSystemText } from "../../inbox/index.js";
import { uuidFromKey } from "../../jobs/index.js";
import { DomainError, systemActor } from "../../kernel/index.js";
import { packageFilesIn } from "../../quotes/index.js";
import { autopilotOf } from "../autopilot.js";
import { mediaForPrompt } from "../media.js";
import type { ActDeps, ActInput } from "./act-types.js";
import { bookingPackage } from "./actions.js";
import { buildCard } from "./card.js";
import type { LookupPackage } from "./lookup-types.js";

/** Why a send was refused, as the sentence the web app already has for it. */
const refusals: Record<string, string> = {
  not_connected: "WHATSAPP_NOT_CONNECTED",
  paused: "WHATSAPP_PAUSED",
  window_closed: "WINDOW_CLOSED",
};

export interface SendSummary {
  replyId: string;
  fileIds: string[];
  qr: boolean;
  pay: boolean;
}

async function queue(
  tx: OrgTx,
  input: ActInput,
  clientToken: string,
  body: string,
  kind: "reply" | "file" | "qr" | "payment",
  media?: { messageId: string; kind: "image" | "video" | "audio" | "document"; fileName: string },
): Promise<string> {
  const sent = await queueSystemText(
    tx,
    {
      conversationId: input.conversationId,
      body,
      sentBy: null,
      origin: "automation",
      clientToken,
      // Answered by the AI: the chat no longer waits, unless it is handed to a person.
      answers: input.actions.handOver === null,
      ...(media === undefined ? {} : { media }),
    },
    input.now,
  );
  if (!sent.ok) {
    throw new DomainError("CONFLICT", refusals[sent.code] ?? "REPLY_NOT_SENT", "The reply could not be sent");
  }
  await recordAudit(tx, systemActor(input.organizationId), {
    action: "ai.message-sent",
    entityType: "whatsapp_message",
    entityId: sent.messageId,
    after: { kind, length: body.length },
  });
  return sent.messageId;
}

/** A stored file copied onto the message that sends it, the copy named by the message's token so a retry finds it. */
async function queueFile(
  tx: OrgTx,
  deps: ActDeps,
  input: ActInput,
  clientToken: string,
  from: AttachmentRefInput,
  kind: "file" | "qr",
): Promise<void> {
  const messageId = uuidFromKey(clientToken);
  const copy = await deps.files.copyFileIn(
    tx,
    systemActor(input.organizationId),
    from,
    { recordType: WHATSAPP_RECORD_TYPE, recordId: messageId },
    deps.storageLimitBytes,
  );
  await queue(tx, input, clientToken, "", kind, { messageId, kind: kindOf(copy.contentType), fileName: copy.fileName });
}

interface FileToSend {
  /** What the chat's facts remember as sent: the brochure's attachment, or the agency's media. */
  id: string;
  from: AttachmentRefInput;
}

/** The brochures of the packages the model named, then the agency's own media, none that this chat has been sent; three at most in all. */
async function filesToSend(tx: OrgTx, input: ActInput): Promise<FileToSend[]> {
  const sent = new Set(input.facts.sentFileIds);
  const found: FileToSend[] = [];
  const keys = new Set(input.actions.sendFiles);
  input.lookup.packages.forEach((one, index) => {
    if (!keys.has(`P${String(index + 1)}`)) return;
    for (const brochure of one.brochures) {
      if (found.length >= MAX_AI_MEDIA_PER_REPLY) return;
      if (sent.has(brochure.id) || found.some((file) => file.id === brochure.id)) continue;
      found.push({
        id: brochure.id,
        from: { recordType: PACKAGE_BROCHURE_RECORD_TYPE, recordId: one.id, attachmentId: brochure.id },
      });
    }
  });
  if (input.actions.sendAgencyFiles) {
    const media = (await mediaForPrompt(tx, input.conversationId)).filter((one) => !one.sentHere && !sent.has(one.id));
    for (const one of media.slice(0, Math.max(0, MAX_AI_MEDIA_PER_REPLY - found.length))) {
      const row = await tx.aiMedia.findUnique({ where: { id: one.id }, select: { attachmentId: true } });
      if (row !== null) {
        found.push({
          id: one.id,
          from: { recordType: AI_MEDIA_RECORD_TYPE, recordId: one.id, attachmentId: row.attachmentId },
        });
      }
    }
  }
  return found;
}

/** "Advance to book: ₹25,000", a blank line, then the package's payment text, else the agency's; code wrote every figure. */
async function paymentText(tx: OrgTx, input: ActInput, one: LookupPackage, key: string): Promise<string> {
  const advance = buildCard(input.lookup).values.get(`[advance total ${key}]`);
  if (advance === undefined) throw new DomainError("CONFLICT", "AI_ACTION_REFUSED", "No advance total to send");
  const template = await tx.quoteTemplate.findUnique({ where: { id: one.id }, select: { paymentDetails: true } });
  const own = template?.paymentDetails.trim() ?? "";
  const details = own === "" ? (await autopilotOf(tx)).paymentDetails.trim() : own;
  return `Advance to book: ${advance}${details === "" ? "" : `\n\n${details}`}`;
}

export async function sendReply(tx: OrgTx, deps: ActDeps, input: ActInput): Promise<SendSummary> {
  const replyId = await queue(tx, input, `ai:${input.token}`, input.text, "reply");
  const fileIds: string[] = [];
  for (const [index, file] of (await filesToSend(tx, input)).entries()) {
    await queueFile(tx, deps, input, `ai:${input.token}:f${String(index + 1)}`, file.from, "file");
    fileIds.push(file.id);
  }
  let qr = false;
  let pay = false;
  const one = bookingPackage(input.lookup);
  if (input.actions.sendPayment) {
    if (one === null) throw new DomainError("CONFLICT", "AI_ACTION_REFUSED", "No package to take payment for");
    const key = `P${String(input.lookup.packages.indexOf(one) + 1)}`;
    const qrId = (await packageFilesIn(tx, one.id)).paymentQrId;
    if (qrId !== null) {
      const from = { recordType: PACKAGE_PAYMENT_QR_RECORD_TYPE, recordId: one.id, attachmentId: qrId };
      await queueFile(tx, deps, input, `ai:${input.token}:qr`, from, "qr");
      qr = true;
    }
    await queue(tx, input, `ai:${input.token}:pay`, await paymentText(tx, input, one, key), "payment");
    pay = true;
  }
  return { replyId, fileIds, qr, pay };
}
