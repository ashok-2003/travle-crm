// Stops organization-owned models from reaching Better Auth's sign-in tables (no row-level security) through relations.
import { Prisma } from "./generated/prisma/client.js";

/** Better Auth's models. Every other model is organization-owned and sits under row-level security. */
export const signInModels: readonly string[] = [
  Prisma.ModelName.User,
  Prisma.ModelName.Session,
  Prisma.ModelName.Account,
  Prisma.ModelName.Verification,
  Prisma.ModelName.TwoFactor,
  Prisma.ModelName.Organization,
  Prisma.ModelName.Member,
  Prisma.ModelName.Invitation,
];

/** The relation every organization-owned model has to the organization table, and from there to members and users. */
const SIGN_IN_RELATION = "organization";

/** Thrown, before any SQL runs, when an organization-owned query follows a relation into the sign-in tables. */
export class SignInRelationError extends Error {
  constructor(model: string, path: string) {
    super(
      `${model} queries may not use the "${SIGN_IN_RELATION}" relation (found at ${path}): it leads to the sign-in ` +
        "tables, which have no row-level security. Use @travel-crm/db/identity from the identity module instead.",
    );
    this.name = "SignInRelationError";
  }
}

function rejectSignInRelation(model: string, value: unknown, path: string): void {
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (key === SIGN_IN_RELATION) throw new SignInRelationError(model, childPath);
    rejectSignInRelation(model, child, childPath);
  }
}

export const signInGuard = Prisma.defineExtension({
  name: "sign-in-relation-guard",
  query: {
    $allModels: {
      async $allOperations({ model, args, query }) {
        if (signInModels.includes(model)) return query(args);
        // data and orderBy matter too: a nested write or an ordering through the relation reaches the same tables.
        for (const part of ["include", "select", "where", "data", "orderBy"] as const) {
          rejectSignInRelation(model, (args as Record<string, unknown>)[part], part);
        }
        return query(args);
      },
    },
  },
});
