// The staff import's temporary passwords (B46): made in the browser and sent here 25 at a time, only to be hashed with
// Better Auth's hasher and kept as hashes on the rows to add. A plain password lives in the request and the hashing,
// then nowhere: it is in no row, event, job or log. Add then needs a hash for every row it will add.
import type { SetStaffPasswordsInput } from "@travel-crm/contracts/identity";
import type { Database } from "@travel-crm/db";
import type { Identity, MemberAccess } from "../../identity/index.js";
import { DomainError } from "../../kernel/index.js";
import { findImport, holdImport, notReady } from "../batches.js";
import { requestImportAdd } from "../import-steps.js";

/**
 * Keeps the hash of each password on its row. Hashing is slow on purpose and happens outside any transaction; a row
 * sent again takes the new hash in place of the first, and a row that isn't to be added takes none. A try the add sent
 * back to the preview is over once the browser sends new passwords.
 */
export async function setStaffImportPasswords(
  db: Database,
  identity: Pick<Identity, "staff">,
  access: MemberAccess,
  input: SetStaffPasswordsInput,
): Promise<void> {
  const first = await db.forOrg(access.organizationId, (tx) => findImport(tx, access, "staff", input.importId));
  if (first.status !== "checked") throw notReady();
  const hashes = await identity.staff.hashTemporaryPasswords(input.passwords.map((entry) => entry.password));
  await db.forOrg(access.organizationId, async (tx) => {
    if ((await holdImport(tx, input.importId))?.status !== "checked") throw notReady();
    for (const [index, entry] of input.passwords.entries()) {
      await tx.importRow.updateMany({
        where: { batchId: input.importId, rowNumber: entry.rowNumber, plan: "new", outcome: null },
        data: { passwordHash: hashes[index] ?? null },
      });
    }
    await tx.importBatch.update({ where: { id: input.importId }, data: { failureReason: null } });
  });
}

/**
 * Add (B45, B46): refused up front past the seats free, and until every row to add has its password's hash. The add
 * job counts again, under a lock, so this is the preview's promise and not the rule.
 */
export async function requestStaffImportAdd(
  db: Database,
  identity: Pick<Identity, "staff">,
  access: MemberAccess,
  importId: string,
  now: Date,
): Promise<void> {
  const batch = await db.forOrg(access.organizationId, (tx) => findImport(tx, access, "staff", importId));
  if (batch.status !== "checked") throw notReady();
  const free = await identity.staff.seatsFree(access.organizationId);
  if (free !== null && batch.rowsToAdd > free) {
    throw new DomainError(
      "LIMIT_REACHED",
      "IMPORT_OVER_SEAT_LIMIT",
      "The file adds more people than the plan has seats free",
    );
  }
  const withHash = await db.forOrg(access.organizationId, (tx) =>
    tx.importRow.count({ where: { batchId: importId, plan: "new", outcome: null, passwordHash: { not: null } } }),
  );
  if (withHash !== batch.rowsToAdd) throw notReady();
  await requestImportAdd(db, access, "staff", importId, now);
}
