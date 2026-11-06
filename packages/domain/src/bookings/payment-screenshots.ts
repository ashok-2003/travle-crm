// The screenshot behind a payment to check, for whoever may check payments (Accounts too, who may read neither leads nor
// chats): a 5-minute link to a claim's picture or the chat message's file, found through the record in the member's lead
// scope, so a record they can't see answers as one that isn't there, and never another record's file.
import { WHATSAPP_RECORD_TYPE } from "@travel-crm/contracts/files";
import type { Database, OrgTx } from "@travel-crm/db";
import type { Files } from "../files/index.js";
import { scopeFilter, type MemberAccess } from "../identity/index.js";
import { mediaLinkFor } from "../inbox/index.js";
import { DomainError } from "../kernel/index.js";

type Stored = { claim: { recordId: string; attachmentId: string } } | { messageId: string } | null;

/** Where the record keeps its screenshot, if the member sees the record and it has one. */
async function storedScreenshot(
  tx: OrgTx,
  access: MemberAccess,
  input: { kind: "claim" | "ai_booking" | "proof"; id: string },
): Promise<Stored> {
  const owned = scopeFilter(access, "bookings:view", "ownerUserId");
  const lead = Object.keys(owned).length === 0 ? {} : { lead: owned };
  if (input.kind === "claim") {
    const claim = await tx.paymentClaim.findFirst({
      where: { id: input.id, ...(Object.keys(lead).length === 0 ? {} : { booking: lead }) },
      select: { bookingId: true, screenshotFileId: true },
    });
    return claim?.screenshotFileId == null
      ? null
      : { claim: { recordId: claim.bookingId, attachmentId: claim.screenshotFileId } };
  }
  if (input.kind === "ai_booking") {
    const booking = await tx.aiBooking.findFirst({
      where: { id: input.id, ...lead },
      select: { proofMessageIds: true },
    });
    const messageId = booking?.proofMessageIds.at(-1);
    return messageId === undefined ? null : { messageId };
  }
  const proof = await tx.paymentProof.findFirst({ where: { id: input.id, ...lead }, select: { messageId: true } });
  return proof === null ? null : { messageId: proof.messageId };
}

export async function paymentScreenshotLink(
  dependencies: { db: Database; files: Files },
  access: MemberAccess,
  input: { kind: "claim" | "ai_booking" | "proof"; id: string },
): Promise<{ url: string }> {
  const notFound = () => new DomainError("NOT_FOUND", "NOT_FOUND", "No such screenshot");
  const stored = await dependencies.db.forOrg(access.organizationId, (tx) => storedScreenshot(tx, access, input));
  if (stored === null) throw notFound();
  if ("claim" in stored) {
    // A claim's file is a picture (its record type takes no other), so it opens in place.
    const link = await dependencies.files.downloadLink(
      access,
      { recordType: "payment_claim", ...stored.claim },
      { inline: true },
    );
    return { url: link.url };
  }
  const [file] = await dependencies.files.list(access, {
    recordType: WHATSAPP_RECORD_TYPE,
    recordId: stored.messageId,
  });
  if (file === undefined) throw notFound();
  return { url: (await mediaLinkFor(dependencies.files, access, stored.messageId, file)).url };
}
