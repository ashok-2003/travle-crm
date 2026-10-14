// Database errors, and recognising them without importing Prisma: other packages may not import @prisma/client.
import { Prisma } from "./generated/prisma/client.js";

/** True when a write failed because a unique value (an email, a username, a role key) is already taken. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Thrown when forOrg() or withoutOrg() is called inside another one. The inner transaction would run on a second connection,
 * blind to the outer one's uncommitted writes, and enough of them at once would empty the pool and deadlock.
 * Pass the outer transaction's `tx` down instead.
 */
export class NestedForOrgError extends Error {
  constructor() {
    super(
      "forOrg() or withoutOrg() was called inside another forOrg() or withoutOrg(). " +
        "Pass the outer transaction's tx down instead.",
    );
    this.name = "NestedForOrgError";
  }
}

/** Thrown when the connection is not the app_runtime role: other roles see every organization's rows. */
export class WrongDatabaseRoleError extends Error {
  constructor(role: string | undefined) {
    super(
      `forOrg() or withoutOrg() is connected to the database as ${JSON.stringify(role)}, but isolation only holds for app_runtime. ` +
        "DATABASE_URL must connect as the app_runtime role (not app_migrator, app_platform or an admin user).",
    );
    this.name = "WrongDatabaseRoleError";
  }
}
