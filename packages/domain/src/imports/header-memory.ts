// The agency's memory of how it matched a header (B9, B10): kept per kind by the header's key, written when the
// importer confirms a file's columns or a Google Sheet's, read when the next file or sheet is.
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

/** Everything the agency remembers of a kind's headers, by key: a sheet's columns are guessed from it. */
export async function rememberedHeaderFields(
  tx: OrgTx,
  kind: ImportKind,
): Promise<ReadonlyMap<string, ImportField | null>> {
  const rows = await tx.importHeaderMatch.findMany({ where: { kind }, select: { headerKey: true, field: true } });
  return new Map(rows.map((row) => [row.headerKey, row.field as ImportField | null]));
}

/**
 * Remembers each confirmed header key's field (B10), the last match winning. New keys are inserted first, skipping
 * any another transaction inserted meanwhile, then every key is set: two at once both land, and neither fails.
 */
export async function rememberHeaderFields(
  tx: OrgTx,
  kind: ImportKind,
  matches: readonly { headerKey: string; field: ImportField | null }[],
  now: Date,
): Promise<void> {
  const fieldOf = new Map(
    matches.filter((match) => match.headerKey !== "").map((match) => [match.headerKey, match.field]),
  );
  if (fieldOf.size === 0) return;
  await tx.importHeaderMatch.createMany({
    data: [...fieldOf].map(([key, field]) => ({ kind, headerKey: key, field, updatedAt: now })),
    skipDuplicates: true,
  });
  for (const field of new Set(fieldOf.values())) {
    const keys = [...fieldOf].filter(([, matched]) => matched === field).map(([key]) => key);
    await tx.importHeaderMatch.updateMany({
      where: { kind, headerKey: { in: keys } },
      data: { field, updatedAt: now },
    });
  }
}
