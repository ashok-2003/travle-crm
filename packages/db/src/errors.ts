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

/**
 * Thrown when an organization transaction reaches for a table without organization_id (webhook_event,
 * rate_limit_counter). Those tables have no row-level security, so only their own module reaches them, inside
 * db.withoutOrg(), through its entry point (@travel-crm/db/webhooks or @travel-crm/db/rate-limits).
 */
export class UnscopedModelError extends Error {
  constructor(model: string) {
    super(
      `${model} has no organization_id and no row-level security, so this transaction can't reach it. ` +
        "Its own module reaches it inside db.withoutOrg(), through its @travel-crm/db entry point.",
    );
    this.name = "UnscopedModelError";
  }
}

/** Thrown when a platform transaction's connection is not the app_platform role, the only one that sees every row. */
export class WrongPlatformRoleError extends Error {
  constructor(role: string | undefined) {
    super(
      `A platform transaction is connected to the database as ${JSON.stringify(role)}, but only app_platform sees ` +
        "every organization. DATABASE_PLATFORM_URL must connect as the app_platform role.",
    );
    this.name = "WrongPlatformRoleError";
  }
}
