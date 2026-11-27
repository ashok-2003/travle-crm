// bookingExports.* and quoteExports.* (bookings revamp, 2026-11-27), on a real database: asking for the list as a file
// needs the list's own view permission; the export's page holds the filter as asked, with its salesperson named; and an
// export is its requester's alone, so another person's is not found.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anAgency, callerOf, createHarness, refusal, type Harness } from "./forms-support.js";

describe("the bookings and quotes exports' procedures", () => {
  let harness: Harness;
  beforeAll(() => {
    harness = createHarness();
  });
  afterAll(() => harness.close());

  const salesperson = "0199a000-0000-7000-8000-0000000000a2";

  it("asks for the Bookings list as a file and shows what it holds, the salesperson named", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes", "bookings"] });
    const { caller } = callerOf(harness, { organizationId });
    const filter = { payment: "overdue", ownerUserId: salesperson, search: "Meera" } as const;
    const { exportId } = await caller.bookingExports.start({ filter, format: "csv" });
    expect(await caller.bookingExports.get({ exportId })).toMatchObject({
      kind: "bookings",
      format: "csv",
      status: "making",
      filter,
      salespersonName: "Asha Rao",
    });
    // Another person's export, or another kind's, is not found.
    const other = callerOf(harness, { organizationId });
    expect(await refusal(other.caller.bookingExports.get({ exportId }))).toBe("NOT_FOUND");
    expect(await refusal(caller.quoteExports.get({ exportId }))).toBe("NOT_FOUND");
  });

  it("asks for the Quotes list as a file and shows what it holds", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes"] });
    const { caller } = callerOf(harness, { organizationId });
    const filter = { balanceDue: true, travelFrom: "2026-12-01" } as const;
    const { exportId } = await caller.quoteExports.start({ filter, format: "xlsx" });
    expect(await caller.quoteExports.get({ exportId })).toMatchObject({
      kind: "quotes",
      status: "making",
      filter,
      salespersonName: null,
    });
  });

  it("needs the list's own view permission", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes", "bookings"] });
    const { caller } = callerOf(harness, { organizationId, granted: ["leads:view"] });
    expect(await refusal(caller.bookingExports.start({ filter: {}, format: "csv" }))).toBe("MISSING_PERMISSION");
    expect(await refusal(caller.quoteExports.start({ filter: {}, format: "csv" }))).toBe("MISSING_PERMISSION");
    expect(await refusal(caller.bookingExports.get({ exportId: randomUUID() }))).toBe("MISSING_PERMISSION");
  });
});
