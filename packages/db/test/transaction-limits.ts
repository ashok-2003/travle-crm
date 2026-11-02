// Test setup: on a shared CI runner a transaction can take longer than Prisma's default five seconds through no fault
// of the code (P2028), so every test client defaults to a longer limit there. Production is untouched: its limits
// come from DATABASE_TRANSACTION_TIMEOUT_MS, and a test that names its own limits keeps them.
import { vi } from "vitest";
import type * as GeneratedClient from "../src/generated/prisma/client.js";

vi.mock("../src/generated/prisma/client.js", async (importOriginal) => {
  const original = await importOriginal<typeof GeneratedClient>();
  if (process.env.CI === undefined) return original;
  class SlowRunnerPrismaClient extends original.PrismaClient {
    constructor(options: ConstructorParameters<typeof original.PrismaClient>[0]) {
      super({ ...options, transactionOptions: { timeout: 30_000, maxWait: 10_000, ...options.transactionOptions } });
    }
  }
  return { ...original, PrismaClient: SlowRunnerPrismaClient };
});
