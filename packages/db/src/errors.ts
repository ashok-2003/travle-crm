// Database errors, and recognising them without importing Prisma: other packages may not import @prisma/client.
import { Prisma } from "./generated/prisma/client.js";

/** True when a write failed because a unique value (an email, a username, a role key) is already taken. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Thrown when the connection is not the app_runtime role: other roles see every organization's rows. */
export class WrongDatabaseRoleError extends Error {
  constructor(role: string | undefined) {
    super(
      `forOrg() is connected to the database as ${JSON.stringify(role)}, but isolation only holds for app_runtime. ` +
        "DATABASE_URL must connect as the app_runtime role (not app_migrator, app_platform or an admin user).",
    );
    this.name = "WrongDatabaseRoleError";
  }
}
