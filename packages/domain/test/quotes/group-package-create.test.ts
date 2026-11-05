// Saving a draft as a group package against the real database and in-memory storage: the package with its seasons, AI can
// sell off and no payment details; a taken name and overlapping seasons refused with nothing saved; the cited PDF as the
// brochure; and which draft fields the owner kept, on the fill.
import { AI_KNOWLEDGE_RECORD_TYPE, PACKAGE_BROCHURE_RECORD_TYPE } from "@travel-crm/contracts/files";
import type { CreateGroupPackageInput } from "@travel-crm/contracts/ai";
import { createMemoryStorage } from "@travel-crm/integrations/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFiles, type Files } from "../../src/files/index.js";
import { attachDraftBrochure, createGroupPackage, seasonsOf } from "../../src/quotes/index.js";
import { openWorld, type World } from "../bookings/support.js";

const reasonOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error as { reason?: string }).reason ?? "other",
  );

describe("saving a draft as a group package", () => {
  let world: World;
  let files: Files;
  let counter = 0;
  const storage = createMemoryStorage();

  beforeAll(async () => {
    world = await openWorld("Draft package agency");
    files = createFiles({ db: world.db, storage });
  });
  afterAll(async () => {
    await world.close();
  });

  const roomPrices = (double: number | null) => ({
    single: null,
    double,
    triple: null,
    quad: null,
    child_bed: null,
    child_no_bed: null,
  });

  async function aFill() {
    const row = await world.inOrg((tx) =>
      tx.aiFill.create({
        data: {
          target: "package_draft",
          subjectType: "organization",
          subjectId: world.organizationId,
          requestedBy: world.manager.userId,
          inputKind: "text",
          model: "test",
          proposalHash: "hash",
          fields: ["name", "nights", "seasons"],
          fieldHashes: {},
        },
        select: { id: true },
      }),
    );
    return row.id;
  }

  async function anInput(overrides: Partial<CreateGroupPackageInput> = {}): Promise<CreateGroupPackageInput> {
    counter += 1;
    return {
      fillId: await aFill(),
      name: `Spiti ${String(counter)}`,
      title: "Spiti Valley 7 nights",
      destinationName: "Spiti",
      nights: 7,
      roomTypes: ["double", "triple"],
      weeklyDays: [5],
      departureMonths: [6, 7],
      seatsPerDeparture: 12,
      seasons: [
        { label: "June", startsOn: "2027-06-01", endsOn: "2027-06-30", prices: roomPrices(2_499_900) },
        { label: "July", startsOn: "2027-07-01", endsOn: "2027-07-31", prices: roomPrices(2_699_900) },
      ],
      pricesIncludeGst: true,
      advancePerPersonPaise: 500_000,
      pickupPoints: "Chandigarh, 6 am",
      startCity: "Chandigarh",
      inclusions: "Stay and breakfast",
      exclusions: "Flights",
      cancellationNotes: "Half back 30 days before",
      summary: "A week in the cold desert",
      highlights: ["Key Monastery"],
      days: [{ title: "Arrive", description: "Reach Chandigarh" }],
      brochureKnowledgeId: null,
      appliedFields: ["name", "seasons"],
      ...overrides,
    };
  }

  const create = (input: CreateGroupPackageInput) => world.inOrg((tx) => createGroupPackage(tx, world.manager, input));

  it("saves the draft as a group package with its seasons, AI can sell off and no payment details", async () => {
    const input = await anInput();
    const { id } = await create(input);
    const row = await world.inOrg((tx) =>
      tx.quoteTemplate.findUniqueOrThrow({ where: { id }, include: { destination: { select: { name: true } } } }),
    );
    expect(row).toMatchObject({
      kind: "group",
      name: input.name,
      nights: 7,
      aiSellable: false,
      paymentDetails: "",
      slug: null,
      published: false,
      pricesIncludeGst: true,
      startCity: "Chandigarh",
    });
    expect(row.advancePerPersonPaise).toBe(500_000n);
    expect(row.destination?.name).toBe("Spiti");
    const seasons = await world.inOrg((tx) => seasonsOf(tx, id));
    expect(seasons.map((season) => season.label)).toEqual(["June", "July"]);
    expect(seasons[0]?.prices.double).toBe(2_499_900);
    const audit = await world.inOrg((tx) =>
      tx.auditEntry.findFirst({ where: { entityId: id, action: "package.created-from-draft" } }),
    );
    expect(JSON.stringify(audit?.after)).toContain(input.fillId);
    expect(JSON.stringify(audit?.after)).not.toContain("2499900");
  });

  it("refuses a taken name", async () => {
    const input = await anInput();
    await create(input);
    expect(await reasonOf(create({ ...input, fillId: await aFill() }))).toBe("PACKAGE_NAME_TAKEN");
  });

  it("refuses overlapping seasons and saves nothing", async () => {
    const input = await anInput({
      seasons: [
        { label: "A", startsOn: "2027-06-01", endsOn: "2027-06-20", prices: roomPrices(1_000_000) },
        { label: "B", startsOn: "2027-06-15", endsOn: "2027-06-30", prices: roomPrices(1_100_000) },
      ],
    });
    expect(await reasonOf(create(input))).toBe("PACKAGE_SEASON_OVERLAPS");
    const left = await world.inOrg((tx) => tx.quoteTemplate.count({ where: { name: input.name } }));
    expect(left).toBe(0);
  });

  it("uses the cited PDF as the brochure", async () => {
    const knowledgeId = await world.inOrg(async (tx) => {
      const row = await tx.aiKnowledge.create({
        data: { title: "Spiti PDF", kind: "file", fileName: "spiti.pdf", createdBy: world.manager.userId },
        select: { id: true },
      });
      return row.id;
    });
    const { attachment, upload } = await files.requestUpload(world.manager, {
      recordType: AI_KNOWLEDGE_RECORD_TYPE,
      recordId: knowledgeId,
      fileName: "spiti.pdf",
      contentType: "application/pdf",
      sizeBytes: 8,
      sensitive: false,
    });
    await storage.upload(upload, new TextEncoder().encode("12345678"), "application/pdf");
    await files.confirmUpload(world.manager, {
      recordType: AI_KNOWLEDGE_RECORD_TYPE,
      recordId: knowledgeId,
      attachmentId: attachment.id,
    });
    await world.inOrg((tx) =>
      tx.aiKnowledge.update({ where: { id: knowledgeId }, data: { attachmentId: attachment.id } }),
    );
    const { id } = await create(await anInput({ brochureKnowledgeId: knowledgeId }));
    await attachDraftBrochure({ db: world.db, files }, world.manager, id, knowledgeId);
    const held = await files.list(world.manager, { recordType: PACKAGE_BROCHURE_RECORD_TYPE, recordId: id });
    expect(held.map((file) => file.fileName)).toEqual(["spiti.pdf"]);
    // The knowledge piece keeps its own file.
    expect(
      await files.list(world.manager, { recordType: AI_KNOWLEDGE_RECORD_TYPE, recordId: knowledgeId }),
    ).toHaveLength(1);
    expect(await reasonOf(attachDraftBrochure({ db: world.db, files }, world.manager, id, world.organizationId))).toBe(
      "NOT_FOUND",
    );
  });

  it("records which fields the owner kept from the draft", async () => {
    const input = await anInput({ appliedFields: ["name", "seasons"] });
    await create(input);
    const fill = await world.inOrg((tx) => tx.aiFill.findUniqueOrThrow({ where: { id: input.fillId } }));
    expect(fill.appliedFields).toEqual(["name", "seasons"]);
    expect(fill.appliedBy).toBe(world.manager.userId);
    expect(fill.appliedAt).not.toBeNull();
    // Someone else's fill, or a rate-sheet one, is not found and nothing is saved.
    const other = await world.inOrg((tx) =>
      tx.aiFill.create({
        data: {
          target: "rate_sheet",
          subjectType: "supplier",
          subjectId: world.organizationId,
          requestedBy: world.manager.userId,
          inputKind: "text",
          model: "test",
          proposalHash: "h",
          fields: [],
          fieldHashes: {},
        },
        select: { id: true },
      }),
    );
    const wrong = await anInput({ fillId: other.id });
    expect(await reasonOf(create(wrong))).toBe("NOT_FOUND");
    expect(await world.inOrg((tx) => tx.quoteTemplate.count({ where: { name: wrong.name } }))).toBe(0);
  });
});
