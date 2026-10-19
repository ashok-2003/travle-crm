// What a staff import's page shows beyond any import's (spec 3.4): the seats free for the people it adds, and, once it
// has added them, who they are, for the passwords' list. Names and sign-in names are identity's, so they are read from
// its staff list after the import's own transaction has ended.
import type { StaffImportedPerson, StaffImportSeats } from "@travel-crm/contracts/identity";
import type { ImportDetail } from "@travel-crm/contracts/imports";
import type { Database } from "@travel-crm/db";
import type { Identity, MemberAccess } from "../../identity/index.js";
import { importDetail } from "../import-detail.js";

export type StaffImportDetail = ImportDetail & { seats: StaffImportSeats; added: StaffImportedPerson[] };

export async function staffImportDetail(
  db: Database,
  identity: Pick<Identity, "staff">,
  access: MemberAccess,
  importId: string,
): Promise<StaffImportDetail> {
  const { detail, rows } = await db.forOrg(access.organizationId, async (tx) => ({
    detail: await importDetail(tx, access, "staff", importId),
    rows: await tx.importRow.findMany({
      where: { batchId: importId, outcome: "added", memberId: { not: null } },
      orderBy: { rowNumber: "asc" },
      select: { rowNumber: true, memberId: true },
    }),
  }));
  const seats = { free: await identity.staff.seatsFree(access.organizationId) };
  if (rows.length === 0) return { ...detail, seats, added: [] };
  const staff = new Map((await identity.staff.list(access)).map((member) => [member.memberId, member]));
  const added = rows.flatMap((row) => {
    const member = row.memberId === null ? undefined : staff.get(row.memberId);
    return member === undefined
      ? []
      : [
          {
            rowNumber: row.rowNumber,
            memberId: member.memberId,
            name: member.name,
            username: member.username,
            email: member.email,
            mustChangePassword: member.mustChangePassword,
          },
        ];
  });
  return { ...detail, seats, added };
}
