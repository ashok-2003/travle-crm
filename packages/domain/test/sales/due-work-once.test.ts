// The minute's sales work walks the agencies, not their WhatsApp numbers (multi-number spec section 12): an agency with
// two numbers has its follow-ups and payment reminders looked at once a pass, never twice.
import type { Database } from "@travel-crm/db";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runSalesDueWork, runSalesDueWorkFor } from "../../src/sales/index.js";
import { aConnectedAgency, aSecondNumber, createTestInbox, testNow, type TestInbox } from "../inbox/support.js";

describe("the minute's sales pass", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  /**
   * What the sales work needs, its database counting the agency's transactions and refusing every other agency's: the
   * test database holds other tests' agencies, which this pass must leave alone.
   */
  function onlyFor(organizationId: string) {
    let transactions = 0;
    const db: Database = {
      forOrg: (id, work, options) => {
        if (id !== organizationId) return Promise.reject(new Error("Another test's agency"));
        transactions += 1;
        return test.db.forOrg(id, work, options);
      },
      withoutOrg: (work, options) => test.db.withoutOrg(work, options),
      disconnect: () => Promise.resolve(),
    };
    const dependencies = {
      db,
      timeZone: () => Promise.resolve("Asia/Kolkata"),
      names: () => Promise.resolve({ agencyName: "Agency", agentName: "Agent" }),
      appUrl: "https://app.example.com",
      logger: createMemoryLogger(),
    };
    return { dependencies, transactions: () => transactions };
  }

  it("runs an agency's sales due work once a pass with two numbers", async () => {
    const first = await aConnectedAgency(test);
    await aSecondNumber(test, first);
    const alone = onlyFor(first.organizationId);
    await runSalesDueWorkFor(alone.dependencies, first.organizationId, testNow);
    const pass = onlyFor(first.organizationId);
    await runSalesDueWork(pass.dependencies, testNow);
    expect(alone.transactions()).toBeGreaterThan(0);
    expect(pass.transactions()).toBe(alone.transactions());
  });
});
