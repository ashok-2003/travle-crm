// The grounded turn's knowledge is the agency's own pieces alone: no trip kits, no quote templates (their prices go stale).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { knowledgePack } from "../../../src/ai/agent-context.js";
import { openWorld, type World } from "../../bookings/support.js";

describe("knowledgePack with only the agency's own pieces", () => {
  let world: World;
  beforeAll(async () => {
    world = await openWorld("Grounded knowledge");
    await world.inOrg(async (tx) => {
      await tx.aiKnowledge.create({ data: { title: "Cancellation", body: "Refund up to 15 days before." } });
      await tx.tripKit.create({
        data: { name: "Kit Manali", message: "Kit Manali price 18500", keywords: ["manali"] },
      });
      await tx.quoteTemplate.create({
        data: {
          name: "Quote Goa",
          title: "Goa quote",
          kind: "custom",
          roomTypes: ["double"],
          items: [],
          inclusions: "Goa stay",
        },
      });
    });
  });
  afterAll(async () => {
    await world.close();
  });

  it("keeps the old behaviour without the option and drops kits and templates with it", async () => {
    const all = await world.inOrg((tx) => knowledgePack(tx, "manali goa cancellation"));
    expect(all).toContain("Kit Manali");
    expect(all).toContain("Quote Goa");
    expect(all).toContain("Cancellation");
    const own = await world.inOrg((tx) => knowledgePack(tx, "manali goa cancellation", { ownOnly: true }));
    expect(own).toContain("Refund up to 15 days before.");
    expect(own).not.toContain("Kit Manali");
    expect(own).not.toContain("Quote Goa");
  });
});
