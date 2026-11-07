// What a package's photos and its brochures and QR share: the package must exist, and a record's ready files come with links.
import type { Database } from "@travel-crm/db";
import type { Files } from "../files/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";

export async function requirePackage(
  { db }: { db: Pick<Database, "forOrg"> },
  access: MemberAccess,
  packageId: string,
): Promise<void> {
  const found = await db.forOrg(access.organizationId, (tx) =>
    tx.quoteTemplate.findUnique({ where: { id: packageId }, select: { id: true } }),
  );
  if (found === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
}

/** The record's ready files in the order they arrived, each with a short-lived link to draw or open it. */
export async function filesWithLinks(
  files: Files,
  access: MemberAccess,
  record: { recordType: string; recordId: string },
) {
  const held = await files.list(access, record);
  return Promise.all(
    held.map(async (file) => ({
      id: file.id,
      fileName: file.fileName,
      contentType: file.contentType,
      url: (await files.downloadLink(access, { ...record, attachmentId: file.id }, { inline: true })).url,
    })),
  );
}
