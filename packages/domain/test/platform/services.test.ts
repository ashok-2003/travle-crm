// What the platform console runs on: a process that builds its services without its log doesn't compile, so what
// goes wrong after a commit (a deletion that storage refused, say) is never left unlogged.
import { createDatabase } from "@travel-crm/db";
import { createMemoryJobAdministration, createMemoryJobQueue } from "@travel-crm/integrations/jobs";
import { createMemoryStorage } from "@travel-crm/integrations/storage";
import { describe, expect, it } from "vitest";
import { createPlatformServices } from "../../src/platform/index.js";
import { createTestPlatform } from "./test-platform.js";

describe("the platform's services", () => {
  it("need the process's log", () => {
    // Compile-time check: `pnpm typecheck` fails if the log becomes optional again. Never called.
    const withoutLog = (identity: ReturnType<typeof createTestPlatform>["services"]["identity"]) =>
      // @ts-expect-error the console must pass its log
      createPlatformServices({
        platformDatabaseUrl: "postgresql://never-connected",
        db: createDatabase("postgresql://never-connected"),
        identity,
        storage: createMemoryStorage(),
        queue: createMemoryJobQueue(),
        jobs: createMemoryJobAdministration(),
      });
    expect(typeof withoutLog).toBe("function");
  });

  it("hand the test platform's log lines to the test", async () => {
    const test = createTestPlatform();
    try {
      test.services.logger.warn({ organizationId: "o1" }, "platform: a line, ids only");
      expect(test.logger.entries).toMatchObject([{ level: "warn", msg: "platform: a line, ids only" }]);
    } finally {
      await test.close();
    }
  });
});
