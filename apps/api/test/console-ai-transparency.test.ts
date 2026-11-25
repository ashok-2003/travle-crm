// The console's AI turn traces: super admins list an agency's turns and open one, logged; support is refused.
import { randomUUID } from "node:crypto";
import type { AiTraceDetail, AiTracePage } from "@travel-crm/contracts/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { createTraceSink } from "@travel-crm/domain/ai";
import { listPlatformLog } from "@travel-crm/domain/platform";
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

describe("the console's AI turn traces", () => {
  let server: TestServer;
  let testConsole: TestConsole;
  let support: TestPlatformStaff;
  let superAdmin: TestPlatformStaff;

  beforeAll(async () => {
    server = createTestServer();
    testConsole = createTestConsole(server, {
      aiPrices: { inputPaisePerMillion: 2_500, outputPaisePerMillion: 10_000 },
    });
    support = await signedInPlatformStaff(server, "support");
    superAdmin = await signedInPlatformStaff(server, "super-admin");
  });

  afterAll(async () => {
    await testConsole.close();
    await server.close();
  });

  /** An agency with one chat and one kept turn of 1,000,000 tokens in and 500,000 out, through the real sink. */
  async function agencyWithTurn() {
    const organizationId = await createTestOrganization(server.platform, "Trace agency");
    const phone = `+9198${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
    const conversationId = await testConsole.services.db.forOrg(organizationId, async (tx) => {
      const connection = await tx.whatsappConnection.create({
        data: {
          integratedNumber: `91${String(Math.floor(Math.random() * 1e10)).padStart(10, "0")}`,
          displayNumber: "+910000000000",
          mode: "new_number",
          status: "disconnected",
        },
      });
      const chat = await tx.whatsappConversation.create({ data: { connectionId: connection.id, phoneE164: phone } });
      return chat.id;
    });
    const trace = {
      id: randomUUID(),
      organizationId,
      conversationId,
      leadId: null,
      kind: "reply" as const,
      startedAt: new Date(),
      durationMs: 800,
      outcome: "replied",
      reason: null,
      model: "fake-model",
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      cachedTokens: 0,
      failedChecks: 0,
      promptVersions: { "real-agent": 0 },
    };
    await createTraceSink({ db: testConsole.services.db, logger: createMemoryLogger() }).recordToolTurn(trace);
    return { organizationId, trace };
  }

  const openings = (organizationId: string) =>
    testConsole.services.platformDb.transaction(async (tx) =>
      (await listPlatformLog(tx, { targetOrganizationId: organizationId, limit: 50 })).entries.filter(
        (entry) => entry.action === "ai-trace.opened",
      ),
    );

  it("support is refused the turns and a turn, and nothing is logged", async () => {
    const { organizationId, trace } = await agencyWithTurn();
    expect(
      await refusalOf(await consoleQuery(testConsole, "aiTransparency.traces", support.jar, { organizationId })),
    ).toEqual({ status: 403, reason: "SUPER_ADMIN_ONLY" });
    expect(
      await refusalOf(
        await consoleQuery(testConsole, "aiTransparency.trace", support.jar, { organizationId, traceId: trace.id }),
      ),
    ).toEqual({ status: 403, reason: "SUPER_ADMIN_ONLY" });
    expect(await openings(organizationId)).toEqual([]);
  });

  it("a super admin lists a turn and opens it, priced", async () => {
    const { organizationId, trace } = await agencyWithTurn();
    const page = await dataOf<AiTracePage>(
      await consoleQuery(testConsole, "aiTransparency.traces", superAdmin.jar, { organizationId }),
    );
    expect(page.priced).toBe(true);
    expect(page.traces).toHaveLength(1);
    expect(page.traces[0]).toMatchObject({ id: trace.id, costPaise: 7_500 });
    const detail = await dataOf<AiTraceDetail>(
      await consoleQuery(testConsole, "aiTransparency.trace", superAdmin.jar, { organizationId, traceId: trace.id }),
    );
    expect(detail).toMatchObject({ trace: { id: trace.id, costPaise: 7_500 }, priced: true });
    expect(await openings(organizationId)).toHaveLength(1);
  });
});
