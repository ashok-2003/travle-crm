// The erased customers' contacts (S43): which of these contacts an organization has kept as a keyed hash and nothing else.
// A thousand to a statement, each statement one `= ANY` on the unique index, so a sheet of twenty thousand rows asks in
// twenty statements, not twenty thousand parameters at once.
import { type OrgTx, sql } from "@travel-crm/db";
import { type ContactKind, hex, type SheetsHashes } from "./hashes.js";

export interface ContactToCheck {
  kind: ContactKind;
  value: string;
}

const contactsPerStatement = 1_000;

/** The `${kind}:${value}` of each contact that is an erased customer's. */
export async function findTombstones(
  tx: OrgTx,
  hashes: SheetsHashes | null,
  contacts: readonly ContactToCheck[],
): Promise<Set<string>> {
  const found = new Set<string>();
  if (hashes === null || contacts.length === 0) return found;
  const unique = new Map(contacts.map((contact) => [`${contact.kind}:${contact.value}`, contact] as const));
  const asked = [...unique].map(([key, contact]) => ({
    key,
    hash: hex(hashes.contactHash(contact.kind, contact.value)),
  }));
  for (let start = 0; start < asked.length; start += contactsPerStatement) {
    const chunk = asked.slice(start, start + contactsPerStatement);
    const rows = await tx.$queryRaw<{ hash: string }[]>(sql`
      SELECT encode(contact_hash, 'hex') AS hash FROM sheet_erased_contact
      WHERE contact_hash = ANY(${chunk.map((item) => Buffer.from(item.hash, "hex"))}::bytea[])`);
    const hit = new Set(rows.map((row) => row.hash));
    for (const item of chunk) if (hit.has(item.hash)) found.add(item.key);
  }
  return found;
}
