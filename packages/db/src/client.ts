// Creates a PrismaClient on the node-postgres driver. Internal: other packages go through index.ts or platform.ts.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

export interface ClientOptions {
  /** Largest number of open connections in this client's pool. */
  max?: number;
}

export function createPrismaClient(connectionString: string, options: ClientOptions = {}): PrismaClient {
  const adapter = new PrismaPg({ connectionString, max: options.max ?? 10 });
  return new PrismaClient({ adapter });
}
