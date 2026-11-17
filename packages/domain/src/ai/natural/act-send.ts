// The natural turn's messages, in order (spec 3.2, 3.3): the model's words as one or two messages, a brochure's files
// captioned with the trip's title, or the one agent's brochure name (none this chat was sent before unless the one agent sends it again, three at most), and after a hold or `resend_payment`
// the agency's payment lines as one text, then its QR. Each carries a token made from the turn's ("ai:<t>", ":m2",
// ":f<n>", ":pay", ":qr"), so a repeat sends none twice; a refusal throws and the turn rolls back.
import { MAX_AI_MEDIA_PER_REPLY } from "@travel-crm/contracts/ai";
import {
  PACKAGE_BROCHURE_RECORD_TYPE,
  PACKAGE_PHOTO_RECORD_TYPE,
  type AttachmentRefInput,
} from "@travel-crm/contracts/files";
import type { OrgTx } from "@travel-crm/db";
import { agencyPaymentQrRecord, paymentLinesOf, type AgencyPaymentDetails } from "../../profile/index.js";
import { packageFilesIn } from "../../quotes/index.js";
import { sendAiFile, sendAiText, type AiMessageTarget } from "../agent-send.js";
import { offerButtons, offerCardBody } from "../one/card.js";
import { stagedOf, type NaturalActDeps, type NaturalActInput } from "./act-types.js";

export interface SentTurn {
  /** Every message, in the order sent. */
  sentIds: string[];
  /** The trip whose brochure the turn sent, and those of its files that went. */
  tripId: string | null;
  fileIds: string[];
  codes: string[];
}

/** The staged files this chat hasn't been sent, each with the record it is kept on (a brochure or a photo). */
async function unsentFiles(
  tx: OrgTx,
  input: NaturalActInput,
  brochure: { packageId: string; fileIds: string[]; resend?: readonly string[] },
): Promise<{ id: string; from: AttachmentRefInput }[]> {
  const { packageId } = brochure;
  const { brochures, photos } = await packageFilesIn(tx, packageId);
  const recordTypes = new Map([
    ...brochures.map((one) => [one.id, PACKAGE_BROCHURE_RECORD_TYPE] as const),
    ...photos.map((one) => [one.id, PACKAGE_PHOTO_RECORD_TYPE] as const),
  ]);
  // A file the one agent sends again though the chat had it.
  const sent = new Set(input.facts.sentFileIds.filter((id) => !brochure.resend?.includes(id)));
  return brochure.fileIds
    .flatMap((id) => {
      const recordType = recordTypes.get(id);
      return recordType === undefined || sent.has(id)
        ? []
        : [{ id, from: { recordType, recordId: packageId, attachmentId: id } }];
    })
    .slice(0, MAX_AI_MEDIA_PER_REPLY);
}

/** Sends the turn's messages; `payment` after a hold or `resend_payment`, `handedOver` when a person must answer next. */
export async function sendTurn(
  tx: OrgTx,
  deps: NaturalActDeps,
  input: NaturalActInput,
  after: { payment: AgencyPaymentDetails | null; handedOver: boolean },
): Promise<SentTurn> {
  const { token } = input;
  const target: AiMessageTarget = {
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    now: input.now,
    // Handed to a person: the chat keeps waiting for one.
    answers: !after.handedOver,
  };
  const sent: SentTurn = { sentIds: [], tripId: null, fileIds: [], codes: [] };
  const [first, ...rest] = input.messages.map((message) => message.trim()).filter((message) => message !== "");
  if (first !== undefined) sent.sentIds.push(await sendAiText(tx, target, `ai:${token}`, first, "reply"));
  // The loop splits at most two; anything past the second stays in it.
  if (rest.length > 0) sent.sentIds.push(await sendAiText(tx, target, `ai:${token}:m2`, rest.join("\n\n"), "reply"));
  // The one agent's offer goes as a card: code's words from the offer record, with its two buttons.
  const offered = stagedOf(input.staged, "offer_booking");
  if (offered?.card === true && offered.offer.id !== undefined) {
    const body = offerCardBody(offered.offer, input.sheets, input.today);
    sent.sentIds.push(
      await sendAiText(tx, target, `ai:${token}:card`, body, "reply", undefined, offerButtons(offered.offer.id)),
    );
    sent.codes.push("card");
  }
  const brochure = stagedOf(input.staged, "send_brochure");
  if (brochure !== null) {
    sent.tripId = brochure.packageId;
    const caption =
      brochure.caption ?? input.sheets.find((sheet) => sheet.packageId === brochure.packageId)?.title ?? "";
    for (const [index, file] of (await unsentFiles(tx, input, brochure)).entries()) {
      const fileToken = `ai:${token}:f${String(index + 1)}`;
      sent.sentIds.push(await sendAiFile(tx, deps, target, fileToken, file.from, "file", caption));
      sent.fileIds.push(file.id);
    }
    if (sent.fileIds.length > 0) sent.codes.push(`files:${String(sent.fileIds.length)}`);
  }
  if (after.payment === null) return sent;
  // The model never sees payment details: code sends them, as the agency saved them.
  const lines = paymentLinesOf(after.payment);
  if (lines.length > 0) {
    sent.sentIds.push(await sendAiText(tx, target, `ai:${token}:pay`, lines.join("\n"), "payment"));
    sent.codes.push("pay");
  }
  const { qrAttachmentId } = after.payment;
  if (qrAttachmentId !== null) {
    const from = { ...agencyPaymentQrRecord(input.organizationId), attachmentId: qrAttachmentId };
    sent.sentIds.push(await sendAiFile(tx, deps, target, `ai:${token}:qr`, from, "qr"));
    sent.codes.push("qr");
  }
  return sent;
}
