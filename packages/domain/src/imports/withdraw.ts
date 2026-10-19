// Withdrawing an organization's import files (B53, B55, D7, D32), in a platform transaction: the erasure's for every
// import at once, the sweep's for those past their week. Each query names the organization, since the platform role
// sees them all. The files go for good through the deletions' outbox; what the imports keep of rows, values and
// headers is emptied; the counts and outcomes stay. An erasure also forgets the agency's header memory (M3).
import { type OrgTx, sql, withDeleted } from "@travel-crm/db";
import { deleteRecordFiles, IMPORT_FILE_RECORD_TYPE, IMPORT_REPORT_RECORD_TYPE } from "../files/index.js";

/** Who an erasure forgets: a customer (crm's person) or a removed member. */
export type ForgottenSubject = { personId: string } | { memberId: string };

const importRecordTypes = [IMPORT_FILE_RECORD_TYPE, IMPORT_REPORT_RECORD_TYPE];

/** The imports among these, or every import of the organization, whose files and kept values go. */
type Imports = readonly string[] | "every";

const whereImports = (organizationId: string, imports: Imports) =>
  imports === "every" ? { organizationId } : { organizationId, batchId: { in: [...imports] } };

/**
 * Empties what the imports keep of a file's contents: samples, listed values, value matches, examples, hashes, and
 * each column's header, which in a file with no header row is its first row of data (M3): a column keeps only its
 * letter ("Column C", positions 0-49).
 */
export async function emptyKeptValues(tx: OrgTx, organizationId: string, imports: Imports): Promise<void> {
  const where = whereImports(organizationId, imports);
  const theirs = imports === "every" ? sql`TRUE` : sql`batch_id = ANY(${[...imports]}::uuid[])`;
  await tx.$executeRaw`
    UPDATE import_column
    SET header = 'Column ' || CASE WHEN position < 26 THEN chr(65 + position) ELSE 'A' || chr(39 + position) END,
      samples = '{}', distinct_values = '{}', distinct_counts = '{}'
    WHERE organization_id = ${organizationId}::uuid AND ${theirs}`;
  await tx.importValueMatch.deleteMany({ where });
  await tx.importRow.updateMany({
    where: {
      ...where,
      OR: [{ exampleName: { not: null } }, { exampleValue: { not: null } }, { passwordHash: { not: null } }],
    },
    data: { exampleName: null, exampleValue: null, passwordHash: null },
  });
}

/**
 * Deletes for good every file stored under these imports, their uploads and reports (D7: the import's ids to them
 * are emptied first, the keys being RESTRICT). Returns how many files went.
 */
export async function deleteImportFiles(
  tx: OrgTx,
  organizationId: string,
  importIds: readonly string[],
  now: Date,
): Promise<number> {
  if (importIds.length === 0) return 0;
  await tx.importBatch.updateMany({
    where: { organizationId, id: { in: [...importIds] } },
    data: { fileAttachmentId: null, reportAttachmentId: null },
  });
  let files = 0;
  for (const recordId of importIds) {
    for (const recordType of importRecordTypes) {
      files += await deleteRecordFiles(tx, { organizationId, recordType, recordId }, now);
    }
  }
  return files;
}

/**
 * An erasure's step (B55, spec 9): every import file of the organization deleted for good, every import's kept values
 * emptied, every import not already expired marked so (its files are gone, and a job meeting it stops quietly, D32),
 * and the forgotten person's rows lose what names them. Returns how many imports it expired and files it deleted.
 */
export async function withdrawImportFiles(
  tx: OrgTx,
  organizationId: string,
  now: Date,
  forget: ForgottenSubject | null,
): Promise<{ imports: number; files: number }> {
  const stored = await withDeleted(() =>
    tx.attachment.findMany({
      where: { organizationId, recordType: { in: importRecordTypes } },
      select: { recordId: true },
      distinct: ["recordId"],
    }),
  );
  const files = await deleteImportFiles(
    tx,
    organizationId,
    stored.map((file) => file.recordId),
    now,
  );
  await emptyKeptValues(tx, organizationId, "every");
  const { count: imports } = await tx.importBatch.updateMany({
    where: { organizationId, status: { not: "expired" } },
    data: { status: "expired", keepUntil: now, fileAttachmentId: null, reportAttachmentId: null },
  });
  // The agency's memory of its headers may hold a headerless file's first row; losing "As last time" is no loss.
  await tx.importHeaderMatch.deleteMany({ where: { organizationId } });
  if (forget !== null) {
    await tx.importRow.updateMany({
      where: { organizationId, ...forget },
      data: { fingerprint: null, leadId: null, personId: null, memberId: null },
    });
  }
  return { imports, files };
}
