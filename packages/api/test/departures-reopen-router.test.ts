// departures.reopen needs departures:edit, on top of departures:view.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { anAgency, callerOf, createHarness, refusal, type Harness } from "./forms-support.js";

describe("departures.reopen", () => {
  let harness: Harness;
  beforeAll(() => {
    harness = createHarness();
  });
  afterAll(() => harness.close());

  it("refuses a member without departures:edit", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "departures"] });
    const { caller } = callerOf(harness, { organizationId, granted: ["departures:view", "departures:create"] });
    expect(await refusal(caller.departures.reopen({ departureId: randomUUID() }))).toBe("MISSING_PERMISSION");
  });

  it("reopens a cancelled departure for a member who may edit", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "departures"] });
    const { caller } = callerOf(harness, { organizationId, granted: ["departures:view", "departures:edit"] });
    const made = await harness.db.forOrg(organizationId, (tx) =>
      tx.departure.create({
        data: {
          title: "Batch",
          startDate: new Date("2099-01-10T00:00:00Z"),
          endDate: new Date("2099-01-14T00:00:00Z"),
          seatsTotal: 8,
          status: "cancelled",
          cancelledReason: "Road closed",
        },
        select: { id: true },
      }),
    );
    await caller.departures.reopen({ departureId: made.id });
    const row = await harness.db.forOrg(organizationId, (tx) =>
      tx.departure.findUniqueOrThrow({ where: { id: made.id } }),
    );
    expect(row.status).toBe("open");
  });
});
