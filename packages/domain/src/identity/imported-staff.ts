// Adding an imported team (B45, B47): every account of a staff file in one transaction, or none. It holds the
// organization's row and counts the seats for the whole file, so two imports, or an import and Add staff, can't both
// take the last seats; writes each account as Add staff does (a temporary password already hashed, to change at first
// sign-in), and lets the import link its rows to the new members in that same transaction. A row the agency has
// changed since the check (a username taken, a role gone or widened) fails the whole add, naming the row.
import type { RowReasonCode } from "@travel-crm/contracts/imports";
import type { IdentityDatabase, IdentityTx } from "@travel-crm/db/identity";
import { DomainError } from "../kernel/index.js";
import { assertMayHandleRole } from "./access-rules.js";
import type { MemberAccess } from "./member-access.js";
import type { FoundRole } from "./role-lookup.js";
import { findRoleToGive } from "./role-lookup.js";
import { assertSeatsFree, insertStaffAccount, type AccountLookups } from "./staff-accounts.js";
import type { SeatLimit } from "./staff.js";

/** 500 accounts in one transaction need longer than the 5 seconds a transaction gets by default (D25). */
const ADD_TIMEOUT_MS = 30_000;

export interface ImportedStaffRow {
  rowNumber: number;
  name: string;
  email?: string | undefined;
  username?: string | undefined;
  /** In E.164. */
  phone?: string | undefined;
  roleKey: string;
  /** The temporary password's hash, made by hashTemporaryPasswords: the password itself never gets here. */
  passwordHash: string;
}

export interface AddedStaff {
  rowNumber: number;
  memberId: string;
  userId: string;
}

/** A row of the file that can't be added now, and why in the reasons a row not added gets (D24). */
export class ImportedStaffRowError extends Error {
  readonly rowNumber: number;
  readonly reason: Extract<RowReasonCode, "taken_meanwhile" | "role_unmatched" | "role_above_yours" | "owner_role">;

  constructor(rowNumber: number, reason: ImportedStaffRowError["reason"]) {
    super(`Row ${String(rowNumber)} can't be added now: ${reason}`);
    this.name = "ImportedStaffRowError";
    this.rowNumber = rowNumber;
    this.reason = reason;
  }
}

const refusedBy: Readonly<Record<string, ImportedStaffRowError["reason"]>> = {
  EMAIL_OR_USERNAME_TAKEN: "taken_meanwhile",
  ROLE_NOT_FOUND: "role_unmatched",
  EXCEEDS_YOUR_PERMISSIONS: "role_above_yours",
  OWNER_ONLY: "owner_role",
};

/** An imported person never takes the Owner role (B44), and the importer never gives more than they hold. */
function assertMayGive(actor: MemberAccess, role: FoundRole): void {
  if (role.isOwner) throw new DomainError("FORBIDDEN", "OWNER_ONLY", "The Owner role is added one at a time");
  assertMayHandleRole(actor, role);
}

/** Hashes temporary passwords one after another: each takes about 70 ms and 16 MB, so 25 at once would hold 400 MB. */
export async function hashTemporaryPasswords(
  hashPassword: (password: string) => Promise<string>,
  passwords: readonly string[],
): Promise<string[]> {
  const hashes: string[] = [];
  for (const password of passwords) hashes.push(await hashPassword(password));
  return hashes;
}

export async function addImportedStaff(
  database: IdentityDatabase,
  seatLimit: SeatLimit,
  actor: MemberAccess,
  rows: readonly ImportedStaffRow[],
  importId: string,
  afterwards: (tx: IdentityTx, added: readonly AddedStaff[]) => Promise<void>,
): Promise<AddedStaff[]> {
  const seats = await seatLimit(actor.organizationId);
  return database.forOrg(
    actor.organizationId,
    async (tx) => {
      if (seats !== null) {
        try {
          await assertSeatsFree(tx, actor.organizationId, seats, rows.length);
        } catch (error) {
          if (error instanceof DomainError && error.reason === "SEAT_LIMIT_REACHED") {
            throw new DomainError(
              "LIMIT_REACHED",
              "IMPORT_OVER_SEAT_LIMIT",
              "The file adds more people than the plan has seats free",
            );
          }
          throw error;
        }
      }
      // The organization and each role are looked up once for the whole file, the roles held until the end.
      const organization = await tx.organization.findUniqueOrThrow({ where: { id: actor.organizationId } });
      const roles = new Map<string, ReturnType<typeof findRoleToGive>>();
      const lookups: AccountLookups = {
        organization: () => Promise.resolve(organization),
        role: (key) => {
          const found = roles.get(key) ?? findRoleToGive(tx, key);
          roles.set(key, found);
          return found;
        },
      };
      const added: AddedStaff[] = [];
      for (const row of rows) {
        try {
          const created = await insertStaffAccount(
            tx,
            {
              organizationId: actor.organizationId,
              name: row.name,
              email: row.email,
              username: row.username,
              phone: row.phone,
              roleKey: row.roleKey,
              passwordHash: row.passwordHash,
              mustChangePassword: true,
              actor,
              importId,
            },
            (role) => {
              assertMayGive(actor, role);
            },
            lookups,
          );
          added.push({ rowNumber: row.rowNumber, ...created });
        } catch (error) {
          const reason = error instanceof DomainError ? refusedBy[error.reason] : undefined;
          throw reason === undefined ? error : new ImportedStaffRowError(row.rowNumber, reason);
        }
      }
      await afterwards(tx, added);
      return added;
    },
    { timeout: ADD_TIMEOUT_MS },
  );
}
