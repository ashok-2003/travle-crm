// Database errors, and recognising them without importing Prisma: other packages may not import @prisma/client.
import { Prisma } from "./generated/prisma/client.js";

/** True when a write failed because a unique value (an email, a username, a role key) is already taken. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * The registry key @travel-crm/integrations/jobs reads (its OWN_MESSAGE_KEY) to keep a failed job's message: set on
 * the errors below whose message is fixed text. This package can't import integrations, so the string is repeated,
 * as in the domain kernel; apps/api's console tests check that pg-boss keeps these messages.
 */
const OWN_MESSAGE = Symbol.for("@travel-crm/own-message");

/**
 * Thrown when forOrg() or withoutOrg() is called inside another one. The inner transaction would run on a second connection,
 * blind to the outer one's uncommitted writes, and enough of them at once would empty the pool and deadlock.
 * Pass the outer transaction's `tx` down instead. Also thrown when asOrganization() starts while its platform
 * transaction is already in an organization, inside that step or beside it: their role switches would interleave.
 */
export class NestedForOrgError extends Error {
  constructor(nested: "transaction" | "step" = "transaction") {
    super(
      nested === "transaction"
        ? "forOrg() or withoutOrg() was called inside another forOrg() or withoutOrg(). " +
            "Pass the outer transaction's tx down instead."
        : "asOrganization() was called while its platform transaction is already in an organization, inside that " +
            "step or beside it (as in Promise.all). Step into one organization at a time, awaiting each step.",
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

/**
 * Thrown when a platform transaction is used while it is stepped into an organization, or ends before the step does.
 * Its one connection runs as app_runtime in that organization until asOrganization() returns, so a platform query
 * beside the step would run in the organization, and the step's queries after it as the platform role.
 */
export class OrganizationStepOpenError extends Error {
  static {
    Object.defineProperty(this.prototype, OWN_MESSAGE, { value: true });
  }

  constructor() {
    super(
      "This platform transaction is in an organization until asOrganization() returns, and nothing else may use or " +
        "end it meanwhile. Inside the step, use the step's own transaction; outside it, await asOrganization() first.",
    );
    this.name = "OrganizationStepOpenError";
  }
}

/**
 * Thrown when a step's transaction is used after asOrganization() returned: by then the transaction is the platform
 * role again, so a query made in the step but run later, or work begun in it and awaited outside, would see every
 * organization.
 */
export class OrganizationStepEndedError extends Error {
  static {
    Object.defineProperty(this.prototype, OWN_MESSAGE, { value: true });
  }

  constructor() {
    super(
      "A step into an organization has ended, so its transaction can't be used any more: it would run as the " +
        "platform role. Await everything a step starts before asOrganization() returns.",
    );
    this.name = "OrganizationStepEndedError";
  }
}

/**
 * Thrown on every use of a platform transaction after a step into an organization failed in the database, and in place
 * of its commit. Postgres aborts a transaction at its first error and answers its COMMIT with a silent ROLLBACK, so a
 * caller that caught the step's error and went on would otherwise see the transaction succeed with nothing saved.
 */
export class PlatformTransactionAbortedError extends Error {
  static {
    Object.defineProperty(this.prototype, OWN_MESSAGE, { value: true });
  }

  constructor(options: { cause: unknown }) {
    super(
      "A step into an organization failed in the database, so Postgres aborted this platform transaction: nothing " +
        "it did will be saved, and it can run nothing more. Let the step's error end the transaction.",
      options,
    );
    this.name = "PlatformTransactionAbortedError";
  }
}
