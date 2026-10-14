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

/**
 * What organization-owned models call their relations to sign-in models. Today only "organization", which each of them
 * has and which leads on to members and users. A new one (an `assignedTo User`, say) must be added here:
 * sign-in-relations.test.ts reads the schema and fails until it is.
 */
export const signInRelations: readonly string[] = ["organization"];

/** Thrown, before any SQL runs, when an organization-owned query follows a relation into the sign-in tables. */
export class SignInRelationError extends Error {
  constructor(model: string, relation: string, path: string) {
    super(
      `${model} queries may not use the "${relation}" relation (found at ${path}): it leads to the sign-in ` +
        "tables, which have no row-level security. Use @travel-crm/db/identity from the identity module instead.",
    );
    this.name = "SignInRelationError";
  }
}

/** The part of Prisma's description of the models that the check reads: each field's name, kind and type. */
export type ModelDescriptions = Readonly<
  Record<
    string,
    { readonly fields: readonly { readonly name: string; readonly kind: string; readonly type: string }[] }
  >
>;

// data and orderBy matter too: a nested write or an ordering through the relation reaches the same tables.
const partsThatFollowRelations = ["include", "select", "where", "data", "orderBy"] as const;

/**
 * A check that throws SignInRelationError when a query on an organization-owned model names a sign-in relation at any
 * depth. It follows relations to know which model each level of the arguments describes, so it can skip the values of
 * Json fields: a Json value is the record's own data, and an "organization" key inside it is not a relation.
 */
export function signInRelationCheck(models: ModelDescriptions): (model: string, args: unknown) => void {
  const fieldsByModel = new Map(
    Object.entries(models).map(([name, { fields }]) => [name, new Map(fields.map((field) => [field.name, field]))]),
  );
  const visit = (rootModel: string, model: string, value: unknown, path: string): void => {
    if (typeof value !== "object" || value === null) return;
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${path}.${key}`;
      if (signInRelations.includes(key)) throw new SignInRelationError(rootModel, key, childPath);
      const field = fieldsByModel.get(model)?.get(key);
      if (field?.kind === "scalar" && field.type === "Json") continue;
      // Below a relation the arguments describe the related model; other keys (create, where, AND, some...) don't move.
      visit(rootModel, field?.kind === "object" ? field.type : model, child, childPath);
    }
  };
  return (model, args) => {
    if (signInModels.includes(model)) return;
    for (const part of partsThatFollowRelations) visit(model, model, (args as Record<string, unknown>)[part], part);
  };
}

/**
 * Prisma's description of the models, which every client carries as _runtimeDataModel but the generated code doesn't
 * export. Prisma is pinned (7.10.0); if an upgrade moves it, creating a client fails here rather than the guard
 * running without knowing which fields are relations.
 */
function modelDescriptionsOf(client: object): ModelDescriptions {
  const dataModel = Reflect.get(client, "_runtimeDataModel") as { models?: ModelDescriptions } | undefined;
  if (dataModel?.models === undefined) {
    throw new Error("The Prisma client has no _runtimeDataModel, which the sign-in relation guard reads");
  }
  return dataModel.models;
}

export const signInGuard = Prisma.defineExtension((client) => {
  const rejectSignInRelations = signInRelationCheck(modelDescriptionsOf(client));
  return client.$extends({
    name: "sign-in-relation-guard",
    query: {
      $allModels: {
        async $allOperations({ model, args, query }) {
          rejectSignInRelations(model, args);
          return query(args);
        },
      },
    },
  });
});
