// Creates the Prisma client behind every entry point: the node-postgres driver plus the soft-delete extension.
// Internal: other packages go through index.ts, identity.ts or platform.ts.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
import { softDelete } from "./soft-delete.js";

export interface ClientOptions {
  /** Largest number of open connections in this client's pool. */
  max?: number;
}

export function createPrismaClient(connectionString: string, options: ClientOptions = {}) {
  const adapter = new PrismaPg({ connectionString, max: options.max ?? 10 });
  return new PrismaClient({ adapter }).$extends(softDelete);
}

/** Prisma's client with the soft-delete extension applied. */
export type DatabaseClient = ReturnType<typeof createPrismaClient>;
