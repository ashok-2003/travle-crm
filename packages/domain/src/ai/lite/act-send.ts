// The lite turn's messages, in order: the reply, a picked package's brochures then photos (none this chat was sent
// before, three at most), and after a money move the agency's own QR and payment details. Each carries a token made from
// the turn's ("ai:<t>", ":f<n>", ":qr", ":pay"), so a repeat sends none twice; a refusal throws and the turn rolls back.
import { MAX_AI_MEDIA_PER_REPLY } from "@travel-crm/contracts/ai";
import {
  PACKAGE_BROCHURE_RECORD_TYPE,
  PACKAGE_PHOTO_RECORD_TYPE,
  type AttachmentRefInput,
} from "@travel-crm/contracts/files";
import type { OrgTx } from "@travel-crm/db";
import { agencyPaymentQrRecord, paymentLinesOf } from "../../profile/index.js";
import { packageFilesIn } from "../../quotes/index.js";
import { sendAiFile, sendAiText, type AiMessageTarget } from "../agent-send.js";
import type { MoneyMove } from "./act-money.js";
import type { LiteActDeps, LiteActInput } from "./act-types.js";
import { fixedText } from "./fixed-texts.js";
import type { Part } from "./reply-parts.js";
import type { Decision } from "./types.js";
import type { Found } from "./phrase-match.js";

export interface Sent {
  /** Every message, in the order sent. */
  sentIds: string[];
  /** The reply's words as sent; null when no reply went. */
  text: string | null;
  /** The spans of `text` code wrote: a fixed line's slots, the money message's, the composed reply's. */
  filled: Found[];
  /** The package files sent, for the chat's facts. */
  fileIds: string[];
  codes: string[];
}

type SendInput = LiteActInput & { decision: Decision };

/** The reply's words: code's fixed line for a hand-over and a money move, else the composed reply; null sends none. */
function replyOf(input: SendInput, money: MoneyMove | null): Part | null {
  const { move } = input.decision;
  if (move.kind === "silent") return null;
  if (move.kind === "hand_over") {
    return fixedText(move.reason === "voice_note" ? "voice_note" : "hand_over", input.language, {});
  }
  return money ?? input.reply;
}

/** A newly picked package's brochures, then its photos, that this chat has not been sent. */
async function packageFiles(tx: OrgTx, decision: Decision): Promise<{ id: string; from: AttachmentRefInput }[]> {
  const packageId = decision.facts.packageId;
  if (decision.note !== "package_picked" || packageId === null) return [];
  const { brochures, photos } = await packageFilesIn(tx, packageId);
  const sent = new Set(decision.facts.sentFileIds);
  const file = (recordType: string) => (one: { id: string }) => ({
    id: one.id,
    from: { recordType, recordId: packageId, attachmentId: one.id },
  });
  return [...brochures.map(file(PACKAGE_BROCHURE_RECORD_TYPE)), ...photos.map(file(PACKAGE_PHOTO_RECORD_TYPE))]
    .filter((one) => !sent.has(one.id))
    .slice(0, MAX_AI_MEDIA_PER_REPLY);
}

export async function sendMove(tx: OrgTx, deps: LiteActDeps, input: SendInput, money: MoneyMove | null): Promise<Sent> {
  const { decision, token } = input;
  const target: AiMessageTarget = {
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    now: input.now,
    // Handed to a person: the chat keeps waiting for one.
    answers: decision.move.kind !== "hand_over",
  };
  const reply = replyOf(input, money);
  const sent: Sent = { sentIds: [], text: reply?.text ?? null, filled: reply?.filled ?? [], fileIds: [], codes: [] };
  if (reply === null) return sent;
  sent.sentIds.push(await sendAiText(tx, target, `ai:${token}`, reply.text, "reply"));
  for (const [index, file] of (await packageFiles(tx, decision)).entries()) {
    sent.sentIds.push(await sendAiFile(tx, deps, target, `ai:${token}:f${String(index + 1)}`, file.from, "file"));
    sent.fileIds.push(file.id);
  }
  if (sent.fileIds.length > 0) sent.codes.push(`files:${String(sent.fileIds.length)}`);
  if (money === null) return sent;
  const { qrAttachmentId } = money.payment;
  if (qrAttachmentId !== null) {
    const from = { ...agencyPaymentQrRecord(input.organizationId), attachmentId: qrAttachmentId };
    sent.sentIds.push(await sendAiFile(tx, deps, target, `ai:${token}:qr`, from, "qr"));
    sent.codes.push("qr");
  }
  const lines = paymentLinesOf(money.payment);
  // An agency paid by its QR alone has no lines: a heading with nothing under it says nothing.
  if (lines.length > 0) {
    const heading = fixedText("payment_heading", input.language, {}).text;
    sent.sentIds.push(await sendAiText(tx, target, `ai:${token}:pay`, [heading, ...lines].join("\n"), "payment"));
    sent.codes.push("pay");
  }
  return sent;
}
