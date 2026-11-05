// "Draft the days" and travellers' details read by the AI (release ai3), through the fill engine: the facts the model is given
// (the trip, the agency's packages and knowledge, no price, no amount), exactly the trip's days with an amount taken out, a
// trip of unknown length costing no call; and the travellers' proposal matched to the booking's rows, saved by nothing, with no
// hash or word of it in the fill's row, ID photos only for a member who may open IDs, kept as sensitive inputs, and the batch
// save merging with what the rows hold and audited as drafted by AI.
import { randomUUID } from "node:crypto";
import { createBookingFromQuote, saveTravellersByStaff } from "../../src/bookings/index.js";
import { createMemoryAiModel } from "@travel-crm/integrations/ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { confirmAiInput, fillForm, recordFillApplied, requestAiInput, saveAiSettings } from "../../src/ai/index.js";
import { aQuote } from "../bookings/support.js";
import { anAgency, createTestImports, memberOf, type TestImports } from "../imports/support/test-imports.js";

const NOW = new Date("2026-10-30T06:30:00Z");

const reasonOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error as { reason?: string }).reason ?? "other",
  );

describe("draft the days and read the travellers", () => {
  let test: TestImports;
  beforeAll(() => {
    test = createTestImports();
  });
  afterAll(() => test.close());

  async function agency() {
    const organizationId = await anAgency(test, "Sharma Holidays");
    const owner = memberOf(organizationId, "org-owner");
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    await inOrg((tx) =>
      saveAiSettings(
        tx,
        owner,
        { enabled: true, scoring: true, instructions: "Always mention the tea." },
        { providerReady: true, now: NOW },
      ),
    );
    const model = createMemoryAiModel();
    const dependencies = { db: test.db, model, files: test.files };
    const calls = async () => (await inOrg((tx) => tx.aiUsage.findFirst()))?.calls ?? 0;
    return { organizationId, owner, inOrg, model, dependencies, calls };
  }

  describe("draft the days", () => {
    async function tripOn(
      a: Awaited<ReturnType<typeof agency>>,
      trip: { dates?: [string, string] | null; withPackage?: boolean } = {},
    ) {
      return a.inOrg(async (tx) => {
        const destination = await tx.destination.create({ data: { name: "Manali" }, select: { id: true } });
        const { lead, quote } = await aQuote(tx, { ownerUserId: a.owner.userId, status: "sent", days: 0 });
        await tx.lead.update({
          where: { id: lead.id },
          data: {
            destinationId: destination.id,
            adults: 2,
            childrenAges: [9],
            hotelCategory: "4_star",
            food: "jain",
            budgetPaise: BigInt(9_000_000),
            budgetBasis: "for_everyone",
            ...(trip.dates === null
              ? {}
              : {
                  travelKind: "dates",
                  travelStart: new Date(`${(trip.dates ?? ["2026-12-15", "2026-12-20"])[0]}T00:00:00Z`),
                  travelEnd: new Date(`${(trip.dates ?? ["2026-12-15", "2026-12-20"])[1]}T00:00:00Z`),
                }),
          },
        });
        await tx.quote.update({ where: { id: quote.id }, data: { status: "draft" } });
        if (trip.withPackage === true) {
          await tx.quoteTemplate.create({
            data: {
              name: "Manali 5N",
              title: "Manali",
              destinationId: destination.id,
              nights: 5,
              days: [
                { title: "Arrive in Manali", description: "Check in and rest. Mall Road walk." },
                { title: "Solang Valley", description: "Snow activities. ".repeat(100) },
              ],
            },
          });
        }
        return quote.id;
      });
    }
    const draft = (a: Awaited<ReturnType<typeof agency>>, quoteId: string, note?: string) =>
      fillForm(
        a.dependencies,
        a.owner,
        {
          target: "quote_days",
          subjectId: quoteId,
          source: note === undefined ? { kind: "none" } : { kind: "text", text: note },
        },
        NOW,
      );
    const six = (extra: Record<string, unknown>[] = []) =>
      JSON.stringify({
        days: [
          { title: "Arrive in Manali", description: "Check in. The hotel is Rs 4,500 a night." },
          { title: "Solang Valley", description: "Snow play." },
          { title: "Atal Tunnel", description: "Drive through." },
          { title: "Old Manali", description: "Cafes." },
          { title: "Kasol", description: "River walk." },
          { title: "Depart", description: "Transfer out." },
          ...extra,
        ],
        questions: [],
      });

    it("writes exactly the trip's days, takes an amount out, prices nothing, and keeps no words in its row", async () => {
      const a = await agency();
      const quoteId = await tripOn(a, { withPackage: true });
      a.model.answer(six([{ title: "An extra day", description: "Dropped." }]));
      const proposal = await draft(a, quoteId, "relaxed, no long drives");
      const days = proposal.fields.find((field) => field.path === "quote.days");
      expect((days?.value as unknown[]).length).toBe(6);
      expect(JSON.stringify(days?.value)).not.toContain("4,500");
      expect(proposal.removedAmounts).toBe(true);
      expect(days).toMatchObject({ from: "package", excerpt: "Manali 5N" });
      expect(proposal.fields.map((field) => field.path)).toEqual(["quote.days"]);
      expect(await a.calls()).toBe(1);
      const request = a.model.requests[0];
      expect(request).toMatchObject({ feature: "draft_days", json: true, user: a.organizationId });
      const prompt = request?.messages.map((message) => message.content).join("\n") ?? "";
      expect(prompt).toContain("Days: 6");
      expect(prompt).toContain("Place: Manali");
      expect(prompt).toContain("Children's ages: 9");
      expect(prompt).toContain("Hotel category: 4_star");
      expect(prompt).toContain("Food: jain");
      expect(prompt).toContain("Day 1: Arrive in Manali");
      expect(prompt).toContain("relaxed, no long drives");
      expect(prompt).toContain("Always mention the tea.");
      // The package's text is trimmed, and the budget is a tone, never an amount.
      expect(prompt).not.toContain("Snow activities. ".repeat(60));
      expect(prompt).toContain("budget in mind");
      expect(prompt).not.toMatch(/90,000|9000000|₹/);
      const row = await a.inOrg((tx) => tx.aiFill.findUniqueOrThrow({ where: { id: proposal.fillId } }));
      expect(row).toMatchObject({ target: "quote_days", subjectType: "quote", subjectId: quoteId, appliedAt: null });
      expect(JSON.stringify(row)).not.toMatch(/Manali|Solang|Check in/);
    });

    it("carries the package day each day came from, and drops a source the model made up", async () => {
      const a = await agency();
      const quoteId = await tripOn(a, { withPackage: true });
      a.model.answer(
        JSON.stringify({
          days: [
            { title: "Arrive in Manali", description: "x", from: "Manali 5N, day 1" },
            { title: "Solang Valley", description: "y", from: "manali 5n, DAY 2" },
            { title: "Atal Tunnel", description: "z", from: "Made Up 9N, day 4" },
            { title: "Old Manali", description: "w" },
            { title: "Kasol", description: "v" },
            { title: "Depart", description: "u" },
          ],
        }),
      );
      const proposal = await draft(a, quoteId);
      expect(proposal.fields[0]?.itemHints).toEqual(["Manali 5N, day 1", "Manali 5N, day 2", "", "", "", ""]);
      expect(JSON.stringify(proposal.fields[0]?.value)).not.toContain("Manali 5N, day");
      const prompt = a.model.requests[0]?.messages.map((message) => message.content).join("\n") ?? "";
      expect(prompt).toContain("Day 2: Solang Valley");
    });

    it("drafts without a package, and asks about a missing day", async () => {
      const a = await agency();
      const quoteId = await tripOn(a);
      a.model.answer(
        JSON.stringify({ days: [{ title: "Arrive", description: "Rest." }], questions: ["Which hotel?"] }),
      );
      const proposal = await draft(a, quoteId);
      expect((proposal.fields[0]?.value as unknown[]).length).toBe(1);
      expect(proposal.fields[0]?.excerpt).toBe("");
      expect(proposal.questions).toContain("Which hotel?");
      expect(proposal.questions.join()).toContain("1 of the 6 days");
      expect(proposal.removedAmounts).toBe(false);
      const prompt = a.model.requests[0]?.messages.map((message) => message.content).join("\n") ?? "";
      expect(prompt).not.toContain("The agency's own plans");
    });

    it("takes the trip's length from the note, then refuses a trip of unknown or too great length without a call", async () => {
      const a = await agency();
      const quoteId = await tripOn(a, { dates: null });
      expect(await reasonOf(draft(a, quoteId))).toBe("DRAFT_DAYS_UNKNOWN");
      expect(await reasonOf(draft(a, quoteId, "a 30 day trek"))).toBe("DRAFT_TOO_LONG");
      expect(a.model.requests).toHaveLength(0);
      expect(await a.calls()).toBe(0);
      a.model.answer(six().replace("Depart", "Depart"));
      const proposal = await draft(a, quoteId, "6 days, relaxed");
      expect((proposal.fields[0]?.value as unknown[]).length).toBe(6);
    });

    it("gives the call back when the AI doesn't answer, and works only on a draft quote of the member's own", async () => {
      const a = await agency();
      const quoteId = await tripOn(a);
      a.model.answer({ ok: false, reason: "unavailable" });
      expect(await reasonOf(draft(a, quoteId))).toBe("AI_UNAVAILABLE");
      expect(await a.calls()).toBe(0);
      await a.inOrg((tx) => tx.quote.update({ where: { id: quoteId }, data: { status: "sent" } }));
      expect(await reasonOf(draft(a, quoteId))).toBe("QUOTE_NOT_WRITABLE");
      const stranger = memberOf(a.organizationId, "sales");
      expect(
        await reasonOf(
          fillForm(
            a.dependencies,
            stranger,
            { target: "quote_days", subjectId: quoteId, source: { kind: "none" } },
            NOW,
          ),
        ),
      ).toBe("NOT_FOUND");
      // "Nothing said" is for this target alone.
      expect(
        await reasonOf(
          fillForm(a.dependencies, a.owner, { target: "quote", subjectId: quoteId, source: { kind: "none" } }, NOW),
        ),
      ).toBe("SOURCE_NOT_ALLOWED");
    });

    it("audits a quote save of drafted days as drafted by AI", async () => {
      const a = await agency();
      const quoteId = await tripOn(a);
      a.model.answer(six());
      const proposal = await draft(a, quoteId);
      const days = proposal.fields[0]?.value as { title: string; description: string }[];
      await a.inOrg((tx) =>
        recordFillApplied(
          tx,
          a.owner,
          { fillId: proposal.fillId, paths: ["quote.days"] },
          {
            targets: ["quote", "quote_days"],
            subject: { type: "quote", id: quoteId },
            saved: { "quote.days": [{ ...days[0], title: "Changed" }, ...days.slice(1)] },
          },
          NOW,
        ),
      );
      const row = await a.inOrg((tx) => tx.aiFill.findUniqueOrThrow({ where: { id: proposal.fillId } }));
      expect(row.appliedFields).toEqual(["quote.days"]);
      expect(row.changedFields).toEqual(["quote.days"]);
    });
  });

  describe("travellers", () => {
    async function bookingFor(a: Awaited<ReturnType<typeof agency>>, adults = 4) {
      return a.inOrg(async (tx) => {
        const { quote, lead } = await aQuote(tx, { ownerUserId: a.owner.userId, adults, days: 3 });
        const bookingId = await createBookingFromQuote(
          tx,
          { organizationId: a.organizationId, quoteId: quote.id, confirmed: true },
          NOW,
        );
        if (bookingId === null) throw new Error("no booking");
        const rows = await tx.bookingTraveller.findMany({ where: { bookingId }, orderBy: { position: "asc" } });
        return { bookingId, leadId: lead.id, rows };
      });
    }
    const read = (a: Awaited<ReturnType<typeof agency>>, bookingId: string, text: string, member = a.owner) =>
      fillForm(
        a.dependencies,
        member,
        { target: "travellers", subjectId: bookingId, source: { kind: "text", text } },
        NOW,
      );
    const said = JSON.stringify({
      people: [
        { name: "Ramesh Sharma", dateOfBirth: "12 June 1980", gender: "male" },
        { name: "Sunita", gender: "female", roomRequest: "ground floor" },
        { name: "Aarav", age: 12 },
      ],
      questions: [],
    });

    it("matches people to rows, keeps an age as an age, saves nothing, and keeps nothing of the people in its row", async () => {
      const a = await agency();
      const { bookingId, rows, leadId } = await bookingFor(a);
      a.model.answer(said);
      const proposal = await read(a, bookingId, "Ramesh 12 June 1980, wife Sunita ground floor, son Aarav 12");
      const [field] = proposal.fields;
      expect(field?.path).toBe("travellers");
      const value = field?.value as {
        saidName: string;
        travellerId: string | null;
        ageOnly?: number;
        dateOfBirth?: string;
      }[];
      expect(value.map((one) => [one.saidName, one.travellerId])).toEqual([
        ["Ramesh Sharma", rows[0]?.id],
        ["Sunita", rows[1]?.id],
        ["Aarav", rows[2]?.id],
      ]);
      expect(value[0]?.dateOfBirth).toBe("1980-06-12");
      expect(value[2]).toMatchObject({ ageOnly: 12 });
      expect(value[2]).not.toHaveProperty("dateOfBirth");
      // Nothing was saved; the row belongs to the booking's lead and holds a flag where a hash would be.
      expect(
        (await a.inOrg((tx) => tx.bookingTraveller.findMany({ where: { bookingId } }))).every((one) => one.name === ""),
      ).toBe(true);
      const row = await a.inOrg((tx) => tx.aiFill.findUniqueOrThrow({ where: { id: proposal.fillId } }));
      expect(row).toMatchObject({
        target: "travellers",
        subjectType: "lead",
        subjectId: leadId,
        fields: ["travellers"],
      });
      expect(row.fieldHashes).toEqual({ travellers: "sensitive" });
      expect(row.proposalHash).toBeTruthy();
      expect(JSON.stringify(row)).not.toMatch(/Ramesh|Sunita|1980|ground/);
      // The model is told the words as data and nothing already on the rows.
      const prompt = a.model.requests[0]?.messages.map((message) => message.content).join("\n") ?? "";
      expect(prompt).toContain("<data>Ramesh 12 June 1980");
      expect(a.model.requests[0]?.feature).toBe("fill_form");
    });

    it("hashes nothing of the proposal: the same people hash alike whatever they are", async () => {
      const a = await agency();
      const { bookingId } = await bookingFor(a);
      a.model.answer(said);
      const one = await read(a, bookingId, "x");
      a.model.answer(JSON.stringify({ people: [{ name: "Someone Else", dateOfBirth: "1 Jan 1990" }] }));
      const two = await read(a, bookingId, "y");
      const rows = await a.inOrg((tx) => tx.aiFill.findMany({ where: { id: { in: [one.fillId, two.fillId] } } }));
      expect(new Set(rows.map((row) => row.proposalHash)).size).toBe(1);
    });

    it("refuses a booking that is not the member's or not open, before any call", async () => {
      const a = await agency();
      const { bookingId } = await bookingFor(a);
      const stranger = memberOf(a.organizationId, "sales");
      expect(await reasonOf(read(a, bookingId, "x", stranger))).toBe("NOT_FOUND");
      await a.inOrg((tx) =>
        tx.booking.update({ where: { id: bookingId }, data: { status: "cancelled", cancelledAt: NOW } }),
      );
      expect(await reasonOf(read(a, bookingId, "x"))).toBe("BOOKING_CANCELLED");
      expect(await a.calls()).toBe(0);
    });

    describe("a voice note or a photo", () => {
      async function upload(
        a: Awaited<ReturnType<typeof agency>>,
        contentType: "audio/wav" | "image/jpeg",
        sensitive: boolean,
      ) {
        const bytes = new Uint8Array([1, 2, 3, 4]);
        const slot = await requestAiInput({ files: test.files }, a.owner, { contentType, sizeBytes: 4, sensitive });
        await test.storage.upload({ ...slot.upload, expiresAt: new Date(slot.upload.expiresAt) }, bytes, contentType);
        await confirmAiInput({ files: test.files }, a.owner, {
          recordId: slot.recordId,
          attachmentId: slot.attachmentId,
        });
        return { ...slot, bytes };
      }
      const fromFile = (
        a: Awaited<ReturnType<typeof agency>>,
        bookingId: string,
        attachmentId: string,
        member = a.owner,
      ) =>
        fillForm(
          a.dependencies,
          member,
          { target: "travellers", subjectId: bookingId, source: { kind: "upload", attachmentId } },
          NOW,
        );

      it("reads a sensitive voice note and hands the model the recording; an unmarked one is not read", async () => {
        const a = await agency();
        const { bookingId } = await bookingFor(a);
        const note = await upload(a, "audio/wav", true);
        a.model.answer(said);
        const proposal = await fromFile(a, bookingId, note.attachmentId);
        expect(proposal.fields[0]?.from).toBe("voice");
        expect(a.model.requests[0]?.messages[1]?.attachments).toEqual([
          { type: "audio", format: "wav", bytes: note.bytes },
        ]);
        const stored = await a.inOrg((tx) => tx.attachment.findUniqueOrThrow({ where: { id: note.attachmentId } }));
        expect(stored.sensitive).toBe(true);
        const row = await a.inOrg((tx) => tx.aiFill.findUniqueOrThrow({ where: { id: proposal.fillId } }));
        expect(row.inputAttachmentId).toBe(note.attachmentId);
        const plain = await upload(a, "audio/wav", false);
        expect(await reasonOf(fromFile(a, bookingId, plain.attachmentId))).toBe("SENSITIVE_INPUT_REQUIRED");
      });

      it("reads an ID photo only for a member who may open IDs, and reads a passport only as far as its lines check out", async () => {
        const a = await agency();
        const { bookingId } = await bookingFor(a);
        const photo = await upload(a, "image/jpeg", true);
        const noIds = memberOf(a.organizationId, "sales", { userId: a.owner.userId });
        expect(noIds.permissions.has("documents:view_sensitive")).toBe(false);
        expect(await reasonOf(fromFile(a, bookingId, photo.attachmentId, noIds))).toBe("MISSING_PERMISSION");
        expect(a.model.requests).toHaveLength(0);
        expect(await a.calls()).toBe(0);
        a.model.answer(
          JSON.stringify({
            people: [
              {
                name: "Anna Eriksson",
                idKind: "passport",
                mrzLine1: "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<",
                mrzLine2: "L898902C36UTO7408122F1204159ZE184226B<<<<<10",
                issueDate: "2 Jan 2020",
              },
            ],
          }),
        );
        const proposal = await fromFile(a, bookingId, photo.attachmentId);
        expect(proposal.fields[0]?.from).toBe("image");
        const [person] = proposal.fields[0]?.value as { identity?: { number: string }; dateOfBirth?: string }[];
        expect(person?.identity?.number).toBe("L898902C3");
        expect(person?.dateOfBirth).toBe("1974-08-12");
        const row = await a.inOrg((tx) => tx.aiFill.findUniqueOrThrow({ where: { id: proposal.fillId } }));
        expect(JSON.stringify(row)).not.toMatch(/L898902C3|1974|Eriksson/);
      });
    });

    describe("the save", () => {
      it("fills the rows ticked, keeps what the rows hold, is all or nothing, and is audited as drafted by AI", async () => {
        const a = await agency();
        const { bookingId, rows, leadId } = await bookingFor(a, 3);
        await a.inOrg((tx) =>
          tx.bookingTraveller.update({
            where: { id: rows[0]?.id ?? "" },
            data: { name: "Ramesh", phone: "+919800000001" },
          }),
        );
        a.model.answer(said);
        const proposal = await read(a, bookingId, "x");
        const save = (travellers: Parameters<typeof saveTravellersByStaff>[2]["travellers"], member = a.owner) =>
          a.inOrg((tx) => saveTravellersByStaff(tx, member, { bookingId, travellers }, NOW));
        await save([
          { travellerId: rows[0]?.id ?? "", name: "Ramesh Sharma", dateOfBirth: "1980-06-12" },
          { travellerId: rows[2]?.id ?? "", name: "Aarav", roomRequest: "ground_floor" },
        ]);
        const after = await a.inOrg((tx) =>
          tx.bookingTraveller.findMany({ where: { bookingId }, orderBy: { position: "asc" } }),
        );
        // A field not sent keeps its value; the second row was not ticked.
        expect(after[0]).toMatchObject({ name: "Ramesh Sharma", phone: "+919800000001" });
        expect(after[0]?.dateOfBirth?.toISOString().slice(0, 10)).toBe("1980-06-12");
        expect(after[1]?.name).toBe("");
        expect(after[2]).toMatchObject({ name: "Aarav", roomRequest: "ground_floor" });
        expect(after[2]?.dateOfBirth).toBeNull();

        // One bad entry saves none of them.
        expect(
          await reasonOf(
            save([
              { travellerId: rows[1]?.id ?? "", name: "Sunita" },
              { travellerId: randomUUID(), name: "Nobody" },
            ]),
          ),
        ).toBe("NOT_FOUND");
        expect(
          (await a.inOrg((tx) => tx.bookingTraveller.findUniqueOrThrow({ where: { id: rows[1]?.id ?? "" } }))).name,
        ).toBe("");
        expect(
          await reasonOf(
            save([
              { travellerId: rows[1]?.id ?? "", name: "A" },
              { travellerId: rows[1]?.id ?? "", name: "B" },
            ]),
          ),
        ).toBe("TRAVELLER_REPEATED");
        // An ID number needs documents:view_sensitive.
        const noIds = memberOf(a.organizationId, "sales", { userId: a.owner.userId });
        const identity = {
          kind: "passport" as const,
          number: "Z1234567",
          issuedOn: null,
          expiresOn: null,
          nationality: "IND",
        };
        expect(await reasonOf(save([{ travellerId: rows[1]?.id ?? "", identity }], noIds))).toBe("MISSING_PERMISSION");

        await a.inOrg((tx) =>
          recordFillApplied(
            tx,
            a.owner,
            { fillId: proposal.fillId, paths: ["travellers"] },
            { targets: ["travellers"], subject: { type: "lead", id: leadId }, saved: {} },
            NOW,
          ),
        );
        const fill = await a.inOrg((tx) => tx.aiFill.findUniqueOrThrow({ where: { id: proposal.fillId } }));
        expect(fill).toMatchObject({ appliedFields: ["travellers"], changedFields: [] });
        const audit = await a.inOrg((tx) => tx.auditEntry.findMany({ where: { action: "ai.fill-applied" } }));
        expect(audit).toHaveLength(1);
        expect(JSON.stringify(audit)).not.toMatch(/Ramesh|1980|Z1234567/);
        // A fill belongs to its own booking's lead.
        expect(
          await reasonOf(
            a.inOrg((tx) =>
              recordFillApplied(
                tx,
                a.owner,
                { fillId: proposal.fillId, paths: ["travellers"] },
                { targets: ["travellers"], subject: { type: "lead", id: randomUUID() }, saved: {} },
                NOW,
              ),
            ),
          ),
        ).toBe("NOT_FOUND");
      });
    });
  });
});
