// Soft delete (spec section 5): rows of these models are never removed, only marked deleted, and reads skip them.
import { AsyncLocalStorage } from "node:async_hooks";
import { Prisma } from "./generated/prisma/client.js";

/** Models whose tables have deleted_at and deleted_by. Add a model here when you give its table those columns. */
export const softDeleteModels: readonly string[] = [
  Prisma.ModelName.Role,
  Prisma.ModelName.Member,
  Prisma.ModelName.Attachment,
  Prisma.ModelName.Person,
  Prisma.ModelName.Lead,
  Prisma.ModelName.Destination,
  Prisma.ModelName.BlockedContact,
  Prisma.ModelName.InboxTag,
  Prisma.ModelName.InboxQuickReply,
  Prisma.ModelName.InboxKeywordReply,
];

/** Operations that must neither see nor change deleted rows. Creates are unaffected; deletes and upserts are refused. */
const operationsThatSkipDeletedRows = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
]);

const includeDeletedRows = new AsyncLocalStorage<true>();

/**
 * Runs fn with deleted rows visible to reads and updates, for Trash screens and restoring:
 * `await withDeleted(() => tx.role.findMany({ where: { deletedAt: { not: null } } }))`.
 */
export async function withDeleted<T>(fn: () => Promise<T>): Promise<T> {
  // Awaiting inside run() matters: Prisma queries start when awaited, and the flag only exists inside run().
  return includeDeletedRows.run(true, async () => await fn());
}

/** The fields that soft-delete a row: `tx.role.update({ where: { id }, data: softDeleted(userId) })`. */
export function softDeleted(deletedBy: string): { deletedAt: Date; deletedBy: string } {
  return { deletedAt: new Date(), deletedBy };
}

/** Thrown instead of deleting a row of a soft-delete model. Nothing is sent to the database. */
export class HardDeleteError extends Error {
  constructor(model: string) {
    super(`${model} rows are never deleted. Set deletedAt and deletedBy instead: data: softDeleted(userId).`);
    this.name = "HardDeleteError";
  }
}

/** Thrown instead of upserting a soft-delete model: an upsert could update a deleted row and restore it. */
export class SoftDeleteUpsertError extends Error {
  constructor(model: string) {
    super(
      `${model} rows are soft-deleted, and upsert() could update a deleted row and restore it without withDeleted(). ` +
        "Use findFirst() then create() or update() instead.",
    );
    this.name = "SoftDeleteUpsertError";
  }
}

export const softDelete = Prisma.defineExtension({
  name: "soft-delete",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!softDeleteModels.includes(model)) return query(args);
        // A rewritten delete could not record who deleted the row, so deletes are refused rather than rewritten.
        if (operation === "delete" || operation === "deleteMany") throw new HardDeleteError(model);
        if (operation === "upsert") throw new SoftDeleteUpsertError(model);
        if (!operationsThatSkipDeletedRows.has(operation) || includeDeletedRows.getStore()) return query(args);
        const { where } = args as { where?: object };
        return query({ ...args, where: { ...where, deletedAt: null } });
      },
    },
  },
});
