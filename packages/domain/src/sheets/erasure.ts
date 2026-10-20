// An erased customer's rows never come back from a sheet (S43, spec 9). The customer's row stays in the agency's own sheet,
// which we never change, so the erasure must outlive it: the person's ledger rows keep only a keyed hash of their hash and
// fingerprint (so the same row, read again, is still known, and no guessed phone number can be tested against it); each of
// their contacts is kept as a keyed hash and nothing else (so a different row naming them is left out); and every
// problem's example in the organization is emptied (it can't be tied to one person).
import { ownMessage } from "@travel-crm/integrations/jobs";
import type { OrgTx } from "@travel-crm/db";
import type { SheetsHashes } from "./hashes.js";

/** A customer's contacts as stored: E.164, lower case, no "@". */
export interface ErasedContacts {
  phones: readonly string[];
  emails: readonly string[];
  instagramHandles: readonly string[];
}

export interface SheetsWithdrawn {
  rowsWithdrawn: number;
  contactsKept: number;
  examplesEmptied: number;
}

const none: SheetsWithdrawn = { rowsWithdrawn: 0, contactsKept: 0, examplesEmptied: 0 };

/**
 * Takes the organization's sheet connections for the erasure, before it touches a person or a lead: a check's batch holds
 * its connection first and then the people it saves, and the erasure must come in the same order, so the two wait for each
 * other instead of crossing (SD9).
 */
export async function lockSheetConnections(tx: OrgTx, organizationId: string): Promise<void> {
  // In id order, so two erasures of one organization never wait on each other's rows in a circle (M9).
  await tx.$queryRaw`SELECT id FROM sheet_connection WHERE organization_id = ${organizationId}::uuid ORDER BY id FOR NO KEY UPDATE`;
}

/**
 * Runs in the erasure's platform transaction, naming the organization in every query. Without the hash key it can't be
 * done: for an organization with sheets it fails the job, loudly, naming the setting, rather than skip a step the law
 * asks for (S6); an organization with none needs nothing.
 */
export async function withdrawSheetRows(
  tx: OrgTx,
  hashes: SheetsHashes | null,
  input: { organizationId: string; personId: string; contacts: ErasedContacts; now: Date },
): Promise<SheetsWithdrawn> {
  const { organizationId, personId, contacts, now } = input;
  if (hashes === null) {
    const hasSheets = (await tx.sheetConnection.count({ where: { organizationId } })) > 0;
    if (hasSheets) {
      throw ownMessage(
        new Error("SHEETS_HASH_KEY must be set on the console to erase a customer of an organization with sheets"),
      );
    }
    return none;
  }
  const rows = await tx.sheetRow.findMany({
    where: { organizationId, personId },
    select: { id: true, rawHash: true, fingerprint: true },
  });
  for (const row of rows) {
    await tx.sheetRow.update({
      where: { id: row.id },
      data: {
        rawHash: hashes.rekey(row.rawHash),
        fingerprint: row.fingerprint === null ? null : hashes.rekey(row.fingerprint),
        leadId: null,
        personId: null,
        exampleName: null,
        exampleValue: null,
        status: "erased",
      },
    });
  }
  const tombstones = [
    ...contacts.phones.map((value) => hashes.contactHash("phone", value)),
    ...contacts.emails.map((value) => hashes.contactHash("email", value)),
    ...contacts.instagramHandles.map((value) => hashes.contactHash("instagram", value)),
  ];
  const kept =
    tombstones.length === 0
      ? { count: 0 }
      : await tx.sheetErasedContact.createMany({
          data: tombstones.map((contactHash) => ({ organizationId, contactHash, erasedAt: now })),
          skipDuplicates: true,
        });
  const emptied = await tx.sheetRow.updateMany({
    where: { organizationId, OR: [{ exampleName: { not: null } }, { exampleValue: { not: null } }] },
    data: { exampleName: null, exampleValue: null },
  });
  return { rowsWithdrawn: rows.length, contactsKept: kept.count, examplesEmptied: emptied.count };
}
