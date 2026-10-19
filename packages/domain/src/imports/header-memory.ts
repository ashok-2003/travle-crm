// The agency's memory of how it matched a header (B9, B10): kept per kind by the header's key, written when the
// importer confirms the columns, read when the next file is.
import type { ImportField, ImportKind } from "@travel-crm/contracts/imports";
import type { OrgTx } from "@travel-crm/db";

/** A header's key: lower case, with every space, punctuation mark and symbol removed (D13). "Mobile No." is mobileno. */
export function headerKey(header: string): string {
  return header.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

/** The fields the agency last matched these header keys to; null for Don't import, absent for never matched. */
export async function rememberedFields(
  tx: OrgTx,
  kind: ImportKind,
  keys: readonly string[],
): Promise<Map<string, ImportField | null>> {
  const rows = await tx.importHeaderMatch.findMany({
    where: { kind, headerKey: { in: keys.filter((key) => key !== "") } },
    select: { headerKey: true, field: true },
  });
  return new Map(rows.map((row) => [row.headerKey, row.field as ImportField | null]));
}

/** Remembers each confirmed header's field (B10), the last match winning. */
export async function rememberFields(
  tx: OrgTx,
  organizationId: string,
  kind: ImportKind,
  matches: readonly { header: string; field: ImportField | null }[],
): Promise<void> {
  const byKey = new Map(matches.map((match) => [headerKey(match.header), match.field]));
  for (const [key, field] of byKey) {
    if (key === "") continue;
    await tx.importHeaderMatch.upsert({
      where: { organizationId_kind_headerKey: { organizationId, kind, headerKey: key } },
      create: { kind, headerKey: key, field },
      update: { field },
    });
  }
}
