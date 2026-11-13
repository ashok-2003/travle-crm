// Reading a supplier's rate sheet (release ai3b): off until the agency turns the AI on; one call per read, given back when the AI
// fails or finds nothing; a big sheet is offered by part first and costs nothing until a part is chosen; the model is sent the
// sheet's lines and nothing else; nothing is saved by the reading; the file is the member's own; the save is the supplier's own
// rate writes in one transaction, audited as drafted by AI, approved by the member, with what the member changed.
import { AI_INPUT_RECORD_TYPE } from "@travel-crm/contracts/files";
import { createMemoryAiModel } from "@travel-crm/integrations/ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  confirmAiInput,
  fillForm,
  readRateSheet,
  recordRatesApplied,
  requestRateSheetUpload,
  saveAiSettings,
} from "../../src/ai/index.js";
import { createSupplier, saveRateBatch, saveSeason, supplierRates } from "../../src/suppliers/index.js";
import { anAgency, createTestImports, memberOf, type TestImports } from "../imports/support/test-imports.js";
import { tinyPdf } from "./support/tiny-pdf.js";

const NOW = new Date("2026-11-02T06:30:00Z");
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const hotel = {
  kind: "hotel" as const,
  name: "Hotel Himalaya",
  city: "",
  gstin: "",
  paymentTerms: "",
  paymentDetails: "",
  notes: "",
};

const reasonOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error as { reason?: string }).reason ?? "other",
  );

describe("reading a supplier's rate sheet", () => {
  let test: TestImports;
  beforeAll(() => {
    test = createTestImports();
  });
  afterAll(() => test.close());

  async function agency(options: { aiOn?: boolean } = {}) {
    const organizationId = await anAgency(test, "Rates agency");
    const owner = memberOf(organizationId, "org-owner");
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    if (options.aiOn !== false) {
      await inOrg((tx) =>
        saveAiSettings(tx, owner, { enabled: true, scoring: true }, { providerReady: true, now: NOW }),
      );
    }
    const supplier = await inOrg((tx) => createSupplier(tx, owner, hotel));
    const model = createMemoryAiModel();
    const dependencies = { db: test.db, model, files: test.files, spreadsheets: test.spreadsheets };
    const upload = async (contentType: string, body: Uint8Array, member = owner) => {
      const slot = await requestRateSheetUpload({ files: test.files }, member, {
        contentType: contentType as "application/pdf",
        sizeBytes: body.byteLength,
      });
      await test.storage.upload({ ...slot.upload, expiresAt: new Date(slot.upload.expiresAt) }, body, contentType);
      await confirmAiInput({ files: test.files }, member, { recordId: slot.recordId, attachmentId: slot.attachmentId });
      return slot.attachmentId;
    };
    const sheet = (rows: string[][]) => test.spreadsheets.bytesOf({ header: ["Room", "Plan", "Rate"], rows });
    const read = (attachmentIds: string[], part?: number, member = owner) =>
      readRateSheet(
        dependencies,
        member,
        { supplierId: supplier.id, attachmentIds, ...(part === undefined ? {} : { part }) },
        NOW,
      );
    const calls = async () => (await inOrg((tx) => tx.aiUsage.findFirst()))?.calls ?? 0;
    return { organizationId, owner, inOrg, supplier, model, upload, sheet, read, calls, dependencies };
  }

  const answer = JSON.stringify({
    seasons: [{ label: "Winter", from: "1 Oct 2026", to: "31 Mar 2027", line: "L2" }],
    rates: [
      {
        season: 0,
        item: "Deluxe room",
        mealPlan: "MAP",
        occupancy: "double",
        unit: "per_room_night",
        price: "₹4,500",
        note: "",
        line: "L2",
      },
      {
        season: 0,
        item: "Suite",
        mealPlan: "MAP",
        occupancy: "double",
        unit: "per_room_night",
        price: "7,000",
        note: "",
        line: "L3",
      },
    ],
    questions: [],
  });

  it("is off until the agency turns the AI on, and asks the model nothing while off", async () => {
    const { read, upload, sheet, model, calls } = await agency({ aiOn: false });
    const id = await upload(XLSX, sheet([["Deluxe", "MAP", "4,500"]]));
    expect(await reasonOf(read([id]))).toBe("AI_OFF");
    expect(model.requests).toHaveLength(0);
    expect(await calls()).toBe(0);
  });

  it("reads an Excel file with one call, sends only the sheet's lines, and saves nothing", async () => {
    const { read, upload, sheet, model, calls, inOrg, supplier, owner } = await agency();
    const id = await upload(
      XLSX,
      sheet([
        ["Deluxe room", "MAP", "4,500"],
        ["Suite", "MAP", "7,000"],
      ]),
    );
    model.answer(answer);
    const proposal = await read([id]);
    expect(proposal.parts).toEqual(["Sheet1"]);
    expect(proposal.part).toBe(0);
    expect(proposal.seasons).toEqual([
      expect.objectContaining({
        label: "Winter",
        startsOn: "2026-10-01",
        endsOn: "2027-03-31",
        existingSeasonId: null,
        inPast: false,
      }),
    ]);
    expect(proposal.rates.map((rate) => [rate.ref, rate.item, rate.costPaise, rate.checkThis, rate.source])).toEqual([
      ["r1", "Deluxe room", 450_000, false, "Sheet1, row 2"],
      ["r2", "Suite", 700_000, false, "Sheet1, row 3"],
    ]);
    expect(proposal.sources).toHaveLength(1);
    expect(proposal.usedThisMonth).toBe(1);
    expect(await calls()).toBe(1);

    const [request] = model.requests;
    expect(request?.feature).toBe("read_rates");
    const prompt = JSON.stringify(request?.messages);
    expect(prompt).toContain("L2 [Sheet1, row 2] A: Deluxe room | B: MAP | C: 4,500");
    expect(prompt).not.toContain(owner.userId);
    // Nothing is saved; the row keeps ids, hashes and the row refs, never the sheet's words.
    const fill = await inOrg((tx) => tx.aiFill.findUniqueOrThrow({ where: { id: proposal.fillId ?? "" } }));
    expect(fill).toMatchObject({
      target: "rate_sheet",
      subjectType: "supplier",
      subjectId: supplier.id,
      inputKind: "file",
      fields: ["r1", "r2"],
      appliedAt: null,
    });
    expect(JSON.stringify(fill)).not.toContain("Deluxe");
    const catalog = await inOrg((tx) => supplierRates(tx, supplier.id));
    expect(catalog.seasons).toEqual([]);
  });

  it("reads a PDF by its text", async () => {
    const { read, upload, model } = await agency();
    const id = await upload("application/pdf", tinyPdf([["Room Plan Rate", "Deluxe room MAP 4500"]]));
    model.answer(
      JSON.stringify({
        seasons: [],
        rates: [{ item: "Deluxe room", unit: "per_room_night", price: "4500", line: "L2" }],
        questions: [],
      }),
    );
    const proposal = await read([id]);
    expect(proposal.rates[0]).toMatchObject({ source: "Page 1", excerpt: "Deluxe room MAP 4500", costPaise: 450_000 });
  });

  it("offers a big sheet by part, costs nothing until one is chosen, then reads that part", async () => {
    const { read, upload, sheet, model, calls } = await agency();
    const rows = Array.from({ length: 200 }, (_, index) => [`Room ${String(index + 1)}`, "MAP", String(1000 + index)]);
    const id = await upload(XLSX, sheet(rows));
    const offered = await read([id]);
    expect(offered).toMatchObject({ fillId: null, rates: [], seasons: [], part: null });
    expect(offered.parts.length).toBeGreaterThan(1);
    expect(model.requests).toHaveLength(0);
    expect(await calls()).toBe(0);

    model.answer(
      JSON.stringify({
        seasons: [],
        rates: [{ item: "Room 160", unit: "per_day", price: "1159", line: "L10" }],
        questions: [],
      }),
    );
    const second = await read([id], 1);
    expect(second.part).toBe(1);
    expect(second.parts).toEqual(offered.parts);
    expect(await calls()).toBe(1);
    expect(JSON.stringify(model.requests[0]?.messages)).toContain("Room 151");
    expect(JSON.stringify(model.requests[0]?.messages)).not.toContain("Room 2 ");
    expect(await reasonOf(read([id], 99))).toBe("RATE_SHEET_PART");
  });

  it("gives the call back when the AI does not answer or finds nothing", async () => {
    const { read, upload, sheet, model, calls } = await agency();
    const id = await upload(XLSX, sheet([["Deluxe", "MAP", "4,500"]]));
    model.answer({ ok: false, reason: "unavailable" });
    expect(await reasonOf(read([id]))).toBe("AI_UNAVAILABLE");
    expect(await calls()).toBe(0);
    model.answer(JSON.stringify({ seasons: [], rates: [], questions: [] }));
    expect(await reasonOf(read([id]))).toBe("RATE_SHEET_NOTHING");
    expect(await calls()).toBe(0);
    model.answer("not json at all");
    expect(await reasonOf(read([id]))).toBe("RATE_SHEET_NOTHING");
    expect(await calls()).toBe(0);
  });

  it("reads photos together, sent as pictures, keeping the first in the fill and the rest beside it", async () => {
    const { read, upload, model, inOrg } = await agency();
    const one = await upload("image/jpeg", new Uint8Array([1, 2, 3]));
    const two = await upload("image/png", new Uint8Array([4, 5, 6]));
    model.answer(
      JSON.stringify({
        seasons: [],
        rates: [{ item: "Suite", unit: "per_day", price: "7,000", photo: 2 }],
        questions: [],
      }),
    );
    const proposal = await read([one, two]);
    expect(proposal.parts).toEqual([]);
    expect(proposal.rates[0]).toMatchObject({ source: "Photo 2", checkThis: true, excerpt: "" });
    expect(model.requests[0]?.messages[1]?.attachments).toEqual([
      { type: "image", mimeType: "image/jpeg", bytes: new Uint8Array([1, 2, 3]) },
      { type: "image", mimeType: "image/png", bytes: new Uint8Array([4, 5, 6]) },
    ]);
    const fill = await inOrg((tx) => tx.aiFill.findUniqueOrThrow({ where: { id: proposal.fillId ?? "" } }));
    expect(fill).toMatchObject({ inputKind: "image", inputAttachmentId: one, inputAttachmentIds: [two] });
  });

  it("refuses a mix of a file and photos, five photos, a scan and a file that is not the member's own", async () => {
    const { read, upload, sheet, model, organizationId, supplier, dependencies } = await agency();
    const file = await upload(XLSX, sheet([["Deluxe", "MAP", "4,500"]]));
    const photo = await upload("image/jpeg", new Uint8Array([1]));
    expect(await reasonOf(read([file, photo]))).toBe("RATE_SHEET_MIXED");
    const photos = await Promise.all([1, 2, 3, 4, 5].map(() => upload("image/jpeg", new Uint8Array([1]))));
    expect(await reasonOf(read(photos))).toBe("RATE_SHEET_MIXED");
    const scan = await upload("application/pdf", tinyPdf([[""]]));
    expect(await reasonOf(read([scan]))).toBe("RATE_SHEET_SCANNED");
    // Another member's.
    expect(
      await reasonOf(
        readRateSheet(
          dependencies,
          memberOf(organizationId, "org-owner"),
          { supplierId: supplier.id, attachmentIds: [file] },
          NOW,
        ),
      ),
    ).toBe("NOT_FOUND");
    // Four photos are allowed: this one gets as far as the model, which has no answer scripted, and the call is given back.
    expect(await reasonOf(read(photos.slice(0, 4)))).toBe("AI_NOT_READY");
    expect(model.requests).toHaveLength(1);
  });

  it("takes a rate sheet file up to 10 MB and a photo up to 5 MB, and the other fills refuse it", async () => {
    const { owner, upload, sheet, dependencies, inOrg } = await agency();
    const files = { files: test.files };
    expect(
      await reasonOf(
        requestRateSheetUpload(files, owner, { contentType: "application/pdf", sizeBytes: 10 * 1024 * 1024 + 1 }),
      ),
    ).toBe("AI_INPUT_TOO_LARGE");
    expect(
      await reasonOf(
        requestRateSheetUpload(files, owner, { contentType: "image/png", sizeBytes: 5 * 1024 * 1024 + 1 }),
      ),
    ).toBe("AI_INPUT_TOO_LARGE");
    expect(
      await reasonOf(requestRateSheetUpload(files, owner, { contentType: XLSX, sizeBytes: 10 * 1024 * 1024 })),
    ).toBeNull();
    const id = await upload(XLSX, sheet([["Deluxe", "MAP", "4,500"]]));
    await inOrg((tx) => tx.aiSettings.updateMany({ data: { enabled: true } }));
    expect(
      await reasonOf(
        fillForm(dependencies, owner, { target: "lead", source: { kind: "upload", attachmentId: id } }, NOW),
      ),
    ).toBe("CONTENT_TYPE_NOT_ALLOWED");
    expect(AI_INPUT_RECORD_TYPE).toBe("ai_input");
  });

  describe("the save", () => {
    async function proposed() {
      const world = await agency();
      const id = await world.upload(
        XLSX,
        world.sheet([
          ["Deluxe room", "MAP", "4,500"],
          ["Suite", "MAP", "7,000"],
        ]),
      );
      world.model.answer(answer);
      const proposal = await world.read([id]);
      const fillId = proposal.fillId ?? "";
      const batch = (overrides: Partial<Parameters<typeof saveRateBatch>[2]> = {}) => ({
        supplierId: world.supplier.id,
        fillId,
        seasons: [{ key: 0, label: "Winter", startsOn: "2026-10-01", endsOn: "2027-03-31" }],
        rates: [
          {
            ref: "r1",
            seasonKey: 0,
            item: "Deluxe room",
            mealPlan: "MAP" as const,
            occupancy: "double" as const,
            unit: "per_room_night" as const,
            costPaise: 450_000,
            note: "",
            checked: true as const,
          },
          {
            ref: "r2",
            seasonKey: 0,
            item: "Suite",
            mealPlan: "MAP" as const,
            occupancy: "double" as const,
            unit: "per_room_night" as const,
            costPaise: 710_000,
            note: "",
            checked: true as const,
          },
        ],
        ...overrides,
      });
      const save = (input = batch(), member = world.owner) =>
        world.inOrg(async (tx) => {
          const saved = await saveRateBatch(tx, member, input);
          await recordRatesApplied(
            tx,
            member,
            { fillId: input.fillId, supplierId: input.supplierId, saved: input.rates },
            NOW,
          );
          return saved;
        });
      return { ...world, fillId, batch, save };
    }

    it("saves the checked rows through the supplier's own writes, audited with the reading and what the member changed", async () => {
      const { save, batch, inOrg, supplier, fillId, owner } = await proposed();
      expect(await save()).toEqual({ seasons: 1, rates: 2 });
      const catalog = await inOrg((tx) => supplierRates(tx, supplier.id));
      expect(catalog.seasons).toHaveLength(1);
      expect(catalog.seasons[0]?.rates.map((rate) => [rate.item, rate.costPaise])).toEqual([
        ["Deluxe room", 450_000],
        ["Suite", 710_000],
      ]);
      const fill = await inOrg((tx) => tx.aiFill.findUniqueOrThrow({ where: { id: fillId } }));
      expect(fill.appliedFields).toEqual(["r1", "r2"]);
      // The member changed the suite's price from what the AI read.
      expect(fill.changedFields).toEqual(["r2"]);
      const entries = await inOrg((tx) => tx.auditEntry.findMany({ orderBy: { id: "asc" } }));
      expect(
        entries
          .filter((entry) => entry.action === "supplier.rate-saved")
          .every((entry) => (entry.after as { aiFillId?: string }).aiFillId === fillId),
      ).toBe(true);
      expect(entries.filter((entry) => entry.action === "ai.fill-applied")).toHaveLength(1);
      // The same reading recorded again (a retry) says nothing more.
      await inOrg((tx) =>
        recordRatesApplied(tx, owner, { fillId, supplierId: supplier.id, saved: batch().rates }, NOW),
      );
      expect((await inOrg((tx) => tx.auditEntry.findMany({ where: { action: "ai.fill-applied" } }))).length).toBe(1);
    });

    it("uses a season the supplier has as it is, and changes a rate it has by id", async () => {
      const { save, batch, inOrg, supplier, owner } = await proposed();
      const season = await inOrg((tx) =>
        saveSeason(tx, owner, {
          supplierId: supplier.id,
          label: "Winter",
          startsOn: "2026-10-01",
          endsOn: "2027-03-31",
        }),
      );
      await save(batch({ seasons: [{ key: 0, seasonId: season.id, label: "" }] }));
      const before = await inOrg((tx) => supplierRates(tx, supplier.id));
      expect(before.seasons).toHaveLength(1);
      const rateId = before.seasons[0]?.rates[0]?.id ?? "";
      await inOrg((tx) =>
        saveRateBatch(tx, owner, {
          supplierId: supplier.id,
          fillId: "00000000-0000-4000-8000-000000000000",
          seasons: [{ key: 0, seasonId: season.id, label: "" }],
          rates: [
            {
              ref: "r1",
              seasonKey: 0,
              rateId,
              item: "Deluxe room",
              mealPlan: "MAP",
              occupancy: "double",
              unit: "per_room_night",
              costPaise: 480_000,
              note: "",
              checked: true,
            },
          ],
        }),
      );
      const after = await inOrg((tx) => supplierRates(tx, supplier.id));
      expect(after.seasons[0]?.rates.find((rate) => rate.id === rateId)?.costPaise).toBe(480_000);
    });

    it("saves all or nothing: an overlapping season or a duplicate rate saves none", async () => {
      const { save, batch, inOrg, supplier, owner } = await proposed();
      await inOrg((tx) =>
        saveSeason(tx, owner, {
          supplierId: supplier.id,
          label: "Other",
          startsOn: "2027-01-01",
          endsOn: "2027-02-01",
        }),
      );
      await expect(save()).rejects.toMatchObject({ reason: "SEASON_OVERLAPS" });
      const duplicate = batch({
        seasons: [{ key: 0, label: "Winter", startsOn: "2026-10-01", endsOn: "2026-12-31" }],
        rates: [batch().rates[0], batch().rates[0]].flatMap((rate) => (rate === undefined ? [] : [rate])),
      });
      await expect(save(duplicate)).rejects.toMatchObject({ reason: "RATE_ALREADY_EXISTS" });
      const catalog = await inOrg((tx) => supplierRates(tx, supplier.id));
      expect(catalog.seasons.map((season) => season.label)).toEqual(["Other"]);
      expect(catalog.seasons[0]?.rates).toEqual([]);
    });

    it("refuses a new season with no dates and a reading that is not the member's", async () => {
      const { save, batch, organizationId } = await proposed();
      await expect(save(batch({ seasons: [{ key: 0, label: "Winter" }] }))).rejects.toMatchObject({
        reason: "VALIDATION",
      });
      await expect(save(batch(), memberOf(organizationId, "org-owner"))).rejects.toMatchObject({ reason: "NOT_FOUND" });
    });
  });
});
