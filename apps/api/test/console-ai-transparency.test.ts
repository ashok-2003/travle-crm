// The console's AI prompts: super admins read the prompt library, support is refused.
import type { AiPromptLibrary } from "@travel-crm/contracts/platform";
import { promptLibrary } from "@travel-crm/domain/ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  consoleQuery,
  createTestConsole,
  signedInPlatformStaff,
  type TestConsole,
  type TestPlatformStaff,
} from "./support/console.js";
import { createTestServer, type TestServer } from "./support/test-server.js";
import { dataOf, refusalOf } from "./support/trpc.js";

describe("the console's AI prompt library", () => {
  let server: TestServer;
  let testConsole: TestConsole;
  let support: TestPlatformStaff;
  let superAdmin: TestPlatformStaff;

  beforeAll(async () => {
    server = createTestServer();
    testConsole = createTestConsole(server);
    support = await signedInPlatformStaff(server, "support");
    superAdmin = await signedInPlatformStaff(server, "super-admin");
  });

  afterAll(async () => {
    await testConsole.close();
    await server.close();
  });

  it("support is refused the prompts", async () => {
    expect(await refusalOf(await consoleQuery(testConsole, "aiTransparency.prompts", support.jar))).toEqual({
      status: 403,
      reason: "SUPER_ADMIN_ONLY",
    });
  });

  it("a super admin reads every piece and both calls", async () => {
    const library = await dataOf<AiPromptLibrary>(
      await consoleQuery(testConsole, "aiTransparency.prompts", superAdmin.jar),
    );
    expect(library.pieces.map((piece) => piece.name)).toEqual(promptLibrary().map((piece) => piece.name));
    expect(library.calls.map((call) => call.name)).toEqual(["understand", "write"]);
    expect(library.calls[0]?.blocks[0]).toEqual({
      title: "Agency",
      purpose: "Who the customer is writing to.",
      budget: 200,
    });
  });
});
