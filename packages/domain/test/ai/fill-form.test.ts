// Fill it for me: a proposal from typed words, a recording, a screenshot or a chat; one monthly call taken first and given back
// when the AI doesn't answer or finds nothing; nothing saved by the fill; the row keeps paths and hashes, never words; a
// recording only the member's own; a save that began as a fill audited as drafted by AI, with what the member changed.
import { randomUUID } from "node:crypto";
import { AI_INPUT_RECORD_TYPE } from "@travel-crm/contracts/files";
import { createMemoryAiModel } from "@travel-crm/integrations/ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MONTHLY_AI_LIMIT,
  confirmAiInput,
  fillForm,
  recordFillApplied,
  requestAiInput,
  saveAiSettings,
} from "../../src/ai/index.js";
import { monthStartOf } from "../../src/inbox/index.js";
import { aLead } from "../crm/support/records.js";
import { anAgency, createTestImports, memberOf, type TestImports } from "../imports/support/test-imports.js";

const NOW = new Date("2026-10-30T06:30:00Z");

const reasonOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error as { reason?: string }).reason ?? "other",
  );

const leadJson = JSON.stringify({
  name: "Rahul Sharma",
  phone: "98765 43210",
  destination: "Manali",
  dateFrom: "15 Dec",
  dateTo: "20 Dec",
  adults: 4,
  budget: "1 lakh",
  budgetBasis: "for_everyone",
  excerpts: { destination: "Manali jana hai" },
  questions: [],
});

describe("fill it for me", () => {
  let test: TestImports;
  beforeAll(() => {
    test = createTestImports();
  });
  afterAll(() => test.close());

  async function agency(options: { aiOn?: boolean } = {}) {
    const organizationId = await anAgency(test, "Sharma Holidays");
    const owner = memberOf(organizationId, "org-owner");
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    if (options.aiOn !== false) {
      await inOrg((tx) =>
        saveAiSettings(
          tx,
          owner,
          { enabled: true, scoring: true, instructions: "" },
          { providerReady: true, now: NOW },
        ),
      );
    }
    const model = createMemoryAiModel();
    const dependencies = { db: test.db, model, files: test.files };
    const fill = (
      text: string,
      member = owner,
      target: "lead" | "call_note" | "lead_edit" | "quote" = "lead",
      subjectId?: string,
    ) =>
      fillForm(
        dependencies,
        member,
        { target, ...(subjectId === undefined ? {} : { subjectId }), source: { kind: "text", text } },
        NOW,
      );
    const calls = async () => (await inOrg((tx) => tx.aiUsage.findFirst()))?.calls ?? 0;
    return { organizationId, owner, inOrg, model, fill, calls, dependencies };
  }

  it("is off until the agency turns it on, and asks the AI nothing while off", async () => {
    const { fill, model, calls } = await agency({ aiOn: false });
    expect(await reasonOf(fill("Rahul Manali 4"))).toBe("AI_OFF");
    expect(model.requests).toHaveLength(0);
    expect(await calls()).toBe(0);
  });

  it("proposes a lead from words, takes one call, saves nothing and keeps no words", async () => {
    const { fill, model, calls, inOrg, owner } = await agency();
    model.answer(leadJson);
    const proposal = await fill("Rahul Sharma 98765 43210 Manali jana hai 15 se 20 Dec, 4 log, 1 lakh");
    expect(proposal.fields.map((field) => field.path)).toEqual([
      "person.name",
      "person.phone",
      "trip.destination",
      "trip.when",
      "trip.adults",
      "trip.budget",
    ]);
    expect(proposal.fields.find((field) => field.path === "trip.when")?.value).toEqual({
      kind: "dates",
      from: "2026-12-15",
      to: "2026-12-20",
    });
    expect(proposal).toMatchObject({ usedThisMonth: 1, monthlyLimit: MONTHLY_AI_LIMIT, truncated: false });
    expect(await calls()).toBe(1);

    // The request: the fill feature, JSON asked for, today's date told, the words fenced as data, the agency's id only.
    const [request] = model.requests;
    expect(request).toMatchObject({ feature: "fill_form", json: true, user: owner.organizationId });
    const prompt = request?.messages.map((message) => message.content).join("\n") ?? "";
    expect(prompt).toContain("Today is Friday 2026-10-30");
    expect(prompt).toContain("<data>Rahul Sharma 98765 43210");

    // Nothing was saved, and the row holds paths and hashes only.
    expect(await inOrg((tx) => tx.person.count())).toBe(0);
    expect(await inOrg((tx) => tx.lead.count())).toBe(0);
    const row = await inOrg((tx) => tx.aiFill.findUniqueOrThrow({ where: { id: proposal.fillId } }));
    expect(row).toMatchObject({ target: "lead", inputKind: "text", requestedBy: owner.userId, appliedAt: null });
    expect(JSON.stringify(row)).not.toMatch(/Rahul|98765|Manali|lakh/);
    expect(row.fields).toContain("trip.budget");
  });

  it("uses only the newest part of a long text and says so", async () => {
    const { fill, model } = await agency();
    model.answer(leadJson);
    const proposal = await fill(`${"old ".repeat(2000)}NEWEST WORDS`);
    expect(proposal.truncated).toBe(true);
    const prompt = model.requests[0]?.messages.map((message) => message.content).join("\n") ?? "";
    expect(prompt).toContain("NEWEST WORDS");
    expect(prompt.length).toBeLessThan(9000);
  });

  it("gives the call back when the AI doesn't answer, is busy, or answers with nothing to use", async () => {
    const { fill, model, calls } = await agency();
    model.answer({ ok: false, reason: "unavailable" });
    expect(await reasonOf(fill("hello"))).toBe("AI_UNAVAILABLE");
    model.answer({ ok: false, reason: "rate_limited" });
    expect(await reasonOf(fill("hello"))).toBe("AI_BUSY");
    model.answer("I could not hear anything");
    expect(await reasonOf(fill("hello"))).toBe("AI_NOTHING_TO_FILL");
    model.answer(JSON.stringify({ questions: [] }));
    expect(await reasonOf(fill("hello"))).toBe("AI_NOTHING_TO_FILL");
    expect(await calls()).toBe(0);
  });

  it("asks a question instead of guessing and keeps the call", async () => {
    const { fill, model, calls } = await agency();
    model.answer(JSON.stringify({ name: "Asha", phone: "9876543210", month: "sometime" }));
    const proposal = await fill("Asha 9876543210 jaana hai");
    expect(proposal.questions).toEqual(["Which dates or which month are they travelling?"]);
    expect(await calls()).toBe(1);
  });

  it("stops at the monthly limit without asking the AI", async () => {
    const { fill, model, inOrg } = await agency();
    await inOrg((tx) =>
      tx.aiUsage.create({ data: { month: monthStartOf(NOW, "Asia/Kolkata"), calls: MONTHLY_AI_LIMIT } }),
    );
    expect(await reasonOf(fill("hello"))).toBe("AI_MONTH_LIMIT");
    expect(model.requests).toHaveLength(0);
  });

  it("keeps a lead edit and a call note to their lead, and refuses one out of the member's scope", async () => {
    const { fill, model, inOrg, organizationId } = await agency();
    const lead = await inOrg((tx) => aLead(tx, {}));
    const stranger = memberOf(organizationId, "sales");
    model.answer(JSON.stringify({ adults: 3, roomType: "Twin" }));
    const edit = await fill("3 adults twin room", memberOf(organizationId, "org-owner"), "lead_edit", lead.id);
    expect(edit.fields.map((field) => field.path)).toEqual(["trip.adults", "trip.roomType"]);
    expect(await reasonOf(fill("3 adults", stranger, "lead_edit", lead.id))).toBe("NOT_FOUND");
    expect(await reasonOf(fill("3 adults", memberOf(organizationId, "org-owner"), "lead_edit"))).toBe(
      "SUBJECT_REQUIRED",
    );
  });

  it("reads a recording that is the member's own, and no one else's", async () => {
    const { dependencies, owner, model, organizationId } = await agency();
    const bytes = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);
    const slot = await requestAiInput({ files: test.files }, owner, {
      contentType: "audio/wav",
      sizeBytes: bytes.byteLength,
    });
    await test.storage.upload({ ...slot.upload, expiresAt: new Date(slot.upload.expiresAt) }, bytes, "audio/wav");
    await confirmAiInput({ files: test.files }, owner, { recordId: slot.recordId, attachmentId: slot.attachmentId });
    model.answer(leadJson);
    const proposal = await fillForm(
      dependencies,
      owner,
      { target: "lead", source: { kind: "upload", attachmentId: slot.attachmentId } },
      NOW,
    );
    expect(proposal.fields.every((field) => field.from === "voice")).toBe(true);
    expect(model.requests[0]?.messages[1]?.attachments).toEqual([{ type: "audio", format: "wav", bytes }]);
    const row = await test.db.forOrg(organizationId, (tx) =>
      tx.aiFill.findUniqueOrThrow({ where: { id: proposal.fillId } }),
    );
    expect(row).toMatchObject({ inputKind: "voice", inputAttachmentId: slot.attachmentId });

    // A colleague cannot have the AI read it.
    expect(
      await reasonOf(
        fillForm(
          dependencies,
          memberOf(organizationId, "org-owner"),
          { target: "lead", source: { kind: "upload", attachmentId: slot.attachmentId } },
          NOW,
        ),
      ),
    ).toBe("NOT_FOUND");
    // Nor an upload that never finished.
    const pending = await requestAiInput({ files: test.files }, owner, { contentType: "image/png", sizeBytes: 10 });
    expect(
      await reasonOf(
        fillForm(
          dependencies,
          owner,
          { target: "lead", source: { kind: "upload", attachmentId: pending.attachmentId } },
          NOW,
        ),
      ),
    ).toBe("NOT_FOUND");
    expect(AI_INPUT_RECORD_TYPE).toBe("ai_input");
  });

  it("refuses a recording or a screenshot over its limit", async () => {
    const { owner } = await agency();
    expect(
      await reasonOf(
        requestAiInput({ files: test.files }, owner, { contentType: "audio/wav", sizeBytes: 4 * 1024 * 1024 + 1 }),
      ),
    ).toBe("AI_INPUT_TOO_LARGE");
    expect(
      await reasonOf(
        requestAiInput({ files: test.files }, owner, { contentType: "image/png", sizeBytes: 5 * 1024 * 1024 + 1 }),
      ),
    ).toBe("AI_INPUT_TOO_LARGE");
  });

  describe("a save that began as a fill", () => {
    it("is audited as drafted by AI, approved by the member, with what they changed, and a fill is theirs alone", async () => {
      const { fill, model, inOrg, owner, organizationId } = await agency();
      model.answer(leadJson);
      const proposal = await fill("Rahul");
      const use = { fillId: proposal.fillId, paths: ["person.name", "trip.adults", "trip.budget"] };
      await inOrg((tx) =>
        recordFillApplied(
          tx,
          owner,
          use,
          {
            targets: ["lead"],
            subject: { type: "lead", id: randomUUID() },
            saved: {
              "person.name": "Rahul Sharma",
              // The member raised the adults from 4 to 5, and cleared the budget.
              "trip.adults": 5,
              "trip.budget": null,
            },
          },
          NOW,
        ),
      );
      const row = await inOrg((tx) => tx.aiFill.findUniqueOrThrow({ where: { id: proposal.fillId } }));
      expect(row).toMatchObject({
        appliedBy: owner.userId,
        appliedFields: ["person.name", "trip.adults", "trip.budget"],
        changedFields: ["trip.adults", "trip.budget"],
      });
      expect(row.subjectType).toBe("lead");
      const [entry] = await inOrg((tx) => tx.auditEntry.findMany({ where: { action: "ai.fill-applied" } }));
      expect(entry).toMatchObject({
        entityType: "ai_fill",
        after: {
          target: "lead",
          applied: ["person.name", "trip.adults", "trip.budget"],
          changedByMember: ["trip.adults", "trip.budget"],
        },
      });
      expect(JSON.stringify(entry)).not.toMatch(/Rahul|98765/);

      // The same save again records nothing more; another member's, or another target's, is not found.
      await inOrg((tx) => recordFillApplied(tx, owner, use, { targets: ["lead"], saved: {} }, NOW));
      expect(await inOrg((tx) => tx.auditEntry.count({ where: { action: "ai.fill-applied" } }))).toBe(1);
      const other = memberOf(organizationId, "org-owner");
      expect(
        await reasonOf(inOrg((tx) => recordFillApplied(tx, other, use, { targets: ["lead"], saved: {} }, NOW))),
      ).toBe("NOT_FOUND");
      expect(
        await reasonOf(inOrg((tx) => recordFillApplied(tx, owner, use, { targets: ["quote"], saved: {} }, NOW))),
      ).toBe("NOT_FOUND");
    });
  });
});
