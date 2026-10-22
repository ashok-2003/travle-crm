// The destinations the form offers: the 100 live ones with the most leads first, then by name, none deleted.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { softDeleted } from "@travel-crm/db";
import { offeredDestinations } from "../../src/crm/offered-destinations.js";
import { anAgency, createTestForms, type TestForms } from "../website-forms/support.js";
import { aLead } from "./support/records.js";

describe("offeredDestinations", () => {
  let test: TestForms;
  beforeAll(async () => {
    test = await createTestForms();
  });
  afterAll(() => test.close());

  it("100 most used first, then by name, none deleted", async () => {
    const organizationId = await anAgency(test);
    await test.db.forOrg(organizationId, async (tx) => {
      await tx.destination.createMany({
        data: Array.from({ length: 105 }, (_, index) => ({ name: `Place ${String(index).padStart(3, "0")}` })),
      });
      const named = (name: string) => tx.destination.findFirstOrThrow({ where: { name } });
      const popular = await named("Place 104");
      const middling = await named("Place 103");
      const gone = await named("Place 000");
      for (let n = 0; n < 3; n += 1) await aLead(tx, { destinationId: popular.id });
      await aLead(tx, { destinationId: middling.id });
      await aLead(tx, { destinationId: gone.id });
      await tx.destination.update({ where: { id: gone.id }, data: softDeleted(randomUser) });
    });
    const offered = await test.db.forOrg(organizationId, offeredDestinations);
    expect(offered).toHaveLength(100);
    expect(offered.slice(0, 2).map((destination) => destination.name)).toEqual(["Place 104", "Place 103"]);
    expect(offered[2]?.name).toBe("Place 001");
    expect(offered.map((destination) => destination.name)).not.toContain("Place 000");
    expect(offered.slice(2).map((destination) => destination.name)).toEqual(
      [...offered.slice(2)].map((destination) => destination.name).sort(),
    );
  });

  it("is empty for an agency with no destinations", async () => {
    const organizationId = await anAgency(test);
    expect(await test.db.forOrg(organizationId, offeredDestinations)).toEqual([]);
  });
});

const randomUser = "0199e7a0-0000-7000-8000-0000000000b1";
