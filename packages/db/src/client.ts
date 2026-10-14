// Creates the Prisma client behind every entry point: the node-postgres driver plus the soft-delete extension.
// Internal: other packages go through index.ts, identity.ts or platform.ts.
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "./generated/prisma/client.js";
import { WrongDatabaseRoleError } from "./errors.js";
import { signInGuard } from "./sign-in-guard.js";
import { softDelete } from "./soft-delete.js";

export interface ClientOptions {
  /** Largest number of open connections in this client's pool. */
  max?: number;
  /** Check once, on the first query, that the connection is the app_runtime role. For clients that skip forOrg(). */
  requireRuntimeRole?: boolean;
}

export function createPrismaClient(connectionString: string, options: ClientOptions = {}) {
  const adapter = new PrismaPg({ connectionString, max: options.max ?? 10 });
  const base = new PrismaClient({ adapter });
  let roleCheck: Promise<void> | undefined;
  const requireRuntimeRole = Prisma.defineExtension({
    name: "require-runtime-role",
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          if (options.requireRuntimeRole) {
            // Cached, including a failure: a wrong role must keep failing, not pass on the second query.
            roleCheck ??= base.$queryRaw<{ role: string }[]>`SELECT current_user AS role`.then(([row]) => {
              if (row?.role !== "app_runtime") throw new WrongDatabaseRoleError(row?.role);
            });
            await roleCheck;
          }
          return query(args);
        },
      },
    },
  });
  return base.$extends(requireRuntimeRole).$extends(signInGuard).$extends(softDelete);
}

/** Prisma's client with the soft-delete extension applied. */
export type DatabaseClient = ReturnType<typeof createPrismaClient>;
