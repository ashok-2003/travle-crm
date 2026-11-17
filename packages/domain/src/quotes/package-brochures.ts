// A package brochure's owner-written name and description: read beside the ready files, saved with an audit entry.
import { PACKAGE_BROCHURE_RECORD_TYPE } from "@travel-crm/contracts/files";
import type { DescribeBrochureInput } from "@travel-crm/contracts/quotes";
import type { Database, OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { readyAttachmentsOfRecordsIn } from "../files/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";

export interface BrochureWords {
  attachmentId: string;
  name: string | null;
  description: string | null;
}

/**
 * Each package's ready brochures in the order they arrived, with the owner's words; one never described reads null.
 * Reads start from the ready files, so a row whose file is gone is never shown.
 */
export async function brochuresByPackage(
  tx: OrgTx,
  packageIds: readonly string[],
): Promise<Map<string, BrochureWords[]>> {
  const files = await readyAttachmentsOfRecordsIn(tx, PACKAGE_BROCHURE_RECORD_TYPE, packageIds);
  const attachmentIds = [...files.values()].flatMap((held) => held.map((file) => file.id));
  const rows =
    attachmentIds.length === 0
      ? []
      : await tx.packageBrochure.findMany({
          where: { attachmentId: { in: attachmentIds } },
          select: { attachmentId: true, name: true, description: true },
        });
  const wordsOf = new Map(rows.map((row) => [row.attachmentId, row]));
  return new Map(
    packageIds.map((packageId) => [
      packageId,
      (files.get(packageId) ?? []).map(({ id }) => ({
        attachmentId: id,
        name: wordsOf.get(id)?.name ?? null,
        description: wordsOf.get(id)?.description ?? null,
      })),
    ]),
  );
}

/** Saves the words for a ready brochure of the package inside a transaction already open, audited with before and after. */
export async function saveBrochureWords(tx: OrgTx, access: MemberAccess, input: DescribeBrochureInput): Promise<void> {
  const file = await tx.attachment.findFirst({
    where: {
      id: input.attachmentId,
      recordType: PACKAGE_BROCHURE_RECORD_TYPE,
      recordId: input.packageId,
      status: "ready",
    },
    select: { id: true },
  });
  if (file === null) throw new DomainError("NOT_FOUND", "BROCHURE_NOT_FOUND", "No such brochure on this package");
  const where = { organizationId_attachmentId: { organizationId: access.organizationId, attachmentId: file.id } };
  const earlier = await tx.packageBrochure.findUnique({ where, select: { name: true, description: true } });
  const words = { name: input.name, description: input.description };
  await tx.packageBrochure.upsert({
    where,
    create: { packageId: input.packageId, attachmentId: file.id, ...words, updatedBy: access.userId },
    update: { ...words, updatedBy: access.userId },
  });
  await recordAudit(tx, access, {
    action: "package.brochure-described",
    entityType: "quote_template",
    entityId: input.packageId,
    ...(earlier === null ? {} : { before: { attachmentId: file.id, ...earlier } }),
    after: { attachmentId: file.id, ...words },
  });
}

/** Saves the words (one row per attachment); only a ready brochure of the package can be described. */
export async function describeBrochure(
  { db }: { db: Pick<Database, "forOrg"> },
  access: MemberAccess,
  input: DescribeBrochureInput,
): Promise<void> {
  await db.forOrg(access.organizationId, (tx) => saveBrochureWords(tx, access, input));
}
