// Copying one line into the notes of several packages, first in each, so the part the AI keeps when it shortens notes has it.
import { MAX_PACKAGE_NOTES, type CopyNoteInput, type CopyNoteResult } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";

/** Each chosen package that lacks the line gets it first; one that has it, or would grow too long, is reported and left alone. */
export async function copyNoteToPackages(
  tx: OrgTx,
  access: MemberAccess,
  input: CopyNoteInput,
): Promise<CopyNoteResult> {
  const ids = [...new Set(input.packageIds)];
  const packages = await tx.quoteTemplate.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, notes: true },
  });
  if (packages.length !== ids.length) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  const line = input.line.trim();
  const result: CopyNoteResult = { copied: [], alreadyThere: [], tooLong: [] };
  for (const id of ids) {
    const pack = packages.find((candidate) => candidate.id === id);
    if (pack === undefined) continue;
    if (pack.notes.split("\n").some((existing) => existing.trim() === line)) {
      result.alreadyThere.push(id);
      continue;
    }
    const notes = pack.notes === "" ? line : `${line}\n${pack.notes}`;
    if (notes.length > MAX_PACKAGE_NOTES) {
      result.tooLong.push(id);
      continue;
    }
    await tx.quoteTemplate.update({ where: { id }, data: { notes } });
    await recordAudit(tx, access, {
      action: "package.note-copied",
      entityType: "quote_template",
      entityId: id,
      after: { name: pack.name, line },
    });
    result.copied.push(id);
  }
  return result;
}
