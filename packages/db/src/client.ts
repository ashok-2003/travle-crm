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

/** Each client's cached role check, when it has one. */
const runtimeRoleChecks = new WeakMap<object, () => Promise<void>>();

/**
 * Awaits the client's once-only role check (a no-op for clients made without requireRuntimeRole). Call it BEFORE
 * opening a transaction: inside one, the check would need a second connection, and a small pool could wait forever.
 */
export async function ensureRuntimeRole(client: DatabaseClient): Promise<void> {
  await runtimeRoleChecks.get(client)?.();
}

export function createPrismaClient(connectionString: string, options: ClientOptions = {}) {
  const adapter = new PrismaPg({ connectionString, max: options.max ?? 10 });
  const base = new PrismaClient({ adapter });
  let roleCheck: Promise<void> | undefined;
  const checkRole = (): Promise<void> => {
    // Cached, so a wrong role keeps failing instead of passing on the second query. Other failures (a dropped
    // connection) are not cached: the next query asks again.
    roleCheck ??= base.$queryRaw<{ role: string }[]>`SELECT current_user AS role`
      .then(([row]) => {
        if (row?.role !== "app_runtime") throw new WrongDatabaseRoleError(row?.role);
      })
      .catch((error: unknown) => {
        if (!(error instanceof WrongDatabaseRoleError)) roleCheck = undefined;
        throw error;
      });
    return roleCheck;
  };
  const requireRuntimeRole = Prisma.defineExtension({
    name: "require-runtime-role",
    query: {
      // Covers model queries and raw queries, inside and outside transactions.
      async $allOperations({ args, query }) {
        await checkRole();
        // query() is typed any for the top-level hook; pass its result through untouched.
        const result: unknown = await query(args);
        return result;
      },
    },
  });
  const client = base.$extends(signInGuard).$extends(softDelete);
  if (!options.requireRuntimeRole) return client;
  const checked = client.$extends(requireRuntimeRole);
  // The hook above would run inside a transaction on a second connection when the check isn't cached yet, and a small
  // or cold pool can wait on itself. So $transaction (callback and batch forms) awaits the check before it starts.
  // Never `$extends` this client; the result skips the Proxy that awaits the role check.
  const guarded = new Proxy(checked, {
    get(target, property) {
      if (property === "$transaction") {
        return async (...transactionArguments: Parameters<typeof target.$transaction>) => {
          await checkRole();
          return (target.$transaction as (...parameters: unknown[]) => Promise<unknown>)(...transactionArguments);
        };
      }
      return Reflect.get(target, property) as unknown;
    },
  });
  runtimeRoleChecks.set(guarded, checkRole);
  return guarded;
}

/** Prisma's client with the soft-delete extension applied. */
export type DatabaseClient = ReturnType<typeof createPrismaClient>;
