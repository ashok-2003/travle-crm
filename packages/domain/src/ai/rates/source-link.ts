// A link to open the rate sheet a reading came from, beside its rows: only the member's own finished upload, for as long as the
// 30-day sweep keeps it. A rate sheet isn't personal data.
import { AI_INPUT_RECORD_TYPE } from "@travel-crm/contracts/files";
import type { Database } from "@travel-crm/db";
import type { Files } from "../../files/index.js";
import type { MemberAccess } from "../../identity/index.js";
import { DomainError } from "../../kernel/index.js";

export async function rateSheetSourceLink(
  { db, files }: { db: Database; files: Files },
  access: MemberAccess,
  input: { recordId: string; attachmentId: string },
): Promise<{ url: string; expiresAt: string }> {
  const own = await db.forOrg(access.organizationId, (tx) =>
    tx.attachment.findFirst({
      where: {
        id: input.attachmentId,
        recordId: input.recordId,
        recordType: AI_INPUT_RECORD_TYPE,
        createdBy: access.userId,
        status: "ready",
      },
      select: { id: true },
    }),
  );
  if (own === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  const link = await files.downloadLink(access, { recordType: AI_INPUT_RECORD_TYPE, ...input }, { inline: true });
  return { url: link.url, expiresAt: link.expiresAt.toISOString() };
}
