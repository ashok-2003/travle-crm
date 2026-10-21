// The lead export's rows (spec B37-B41): exactly the list the person sees, B38's columns in order and the agency's
// wall clock, the file named in its zone, the row limit, a requester who lost leads:view, and an audit entry that
// names the filter by ids and never holds the search.
import { randomUUID } from "node:crypto";
import { leadExportHeaders } from "@travel-crm/contracts/crm";
import type { OrgTx } from "@travel-crm/db";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { makeLeadExportListener } from "../../src/crm/index.js";
import { exportDetail, startExport, type ExportJobDependencies } from "../../src/exports/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { guessFields } from "../../src/imports/index.js";
import { leadExportSource } from "../../src/crm/lead-export/lead-export-source.js";
import { runExport } from "../../src/exports/index.js";
import { fakeExportIdentity, requested } from "../exports/test-exports.js";
import {
  anAgency,
  auditOf,
  createTestImports,
  listenerContext,
  memberOf,
  type TestImports,
} from "../imports/support/test-imports.js";
import { aLead, aPerson, aTask } from "./support/records.js";

describe("the lead export", () => {
  let test: TestImports;
  let organizationId: string;
  let manager: MemberAccess;
  let sales: MemberAccess;
  let goaId: string;
  const owners = new Map<string, string>();
  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>) => test.db.forOrg(organizationId, work);

  const dependencies = (access: MemberAccess | null): ExportJobDependencies => ({
    files: test.files,
    spreadsheets: test.spreadsheets,
    identity: {
      ...fakeExportIdentity(access),
      memberContacts: (_organizationId, userIds) =>
        Promise.resolve(
          userIds.flatMap((userId) => {
            const name = owners.get(userId);
            return name === undefined ? [] : [{ userId, name, email: null }];
          }),
        ),
    },
    appUrl: "https://app.example.test",
  });

  /** Asks for an export as `asker` and makes it as `access` (the worker's fresh view of the asker). */
  async function makeExport(
    asker: MemberAccess,
    filter: Record<string, unknown>,
    options: { access?: MemberAccess | null; maxRows?: number; format?: "xlsx" | "csv" } = {},
  ) {
    const { exportId } = await inOrg((tx) =>
      startExport(
        tx,
        asker,
        "leads",
        { format: options.format ?? "xlsx", filter: { view: "mine", stage: "open", ...filter } },
        new Date(),
      ),
    );
    const access = options.access === undefined ? asker : options.access;
    const written = test.spreadsheets.written.length;
    if (options.maxRows === undefined) {
      await makeLeadExportListener(dependencies(access)).handle(
        requested(organizationId, exportId),
        listenerContext(test, organizationId),
      );
    } else {
      await runExport(
        requested(organizationId, exportId),
        listenerContext(test, organizationId),
        dependencies(access),
        leadExportSource(dependencies(access), { timeZone: "Asia/Kolkata", maxRows: options.maxRows }),
      );
    }
    const detail = await inOrg((tx) => exportDetail(tx, asker, "leads", exportId));
    return { exportId, detail, file: test.spreadsheets.written.slice(written)[0] };
  }

  beforeAll(async () => {
    test = createTestImports();
    organizationId = await anAgency(test);
    manager = memberOf(organizationId, "org-admin");
    sales = memberOf(organizationId, "sales");
    owners.set(sales.userId, "Asha Rao");
    goaId = (await inOrg((tx) => tx.destination.create({ data: { name: "Goa" }, select: { id: true } }))).id;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await test.close();
  });

  const namesOf = (rows: (string | number | null)[][] | undefined) => rows?.map((row) => row[0]);

  it("exports exactly the list a person sees: a salesperson's own leads whatever they ask", async () => {
    const someoneElse = randomUUID();
    await inOrg(async (tx) => {
      await aLead(tx, { ownerUserId: sales.userId, personId: (await aPerson(tx, { name: "Own one" })).id });
      await aLead(tx, { ownerUserId: someoneElse, personId: (await aPerson(tx, { name: "Not theirs" })).id });
    });
    const asked = await makeExport(sales, { view: "everyone", ownerUserId: someoneElse });
    expect(namesOf(asked.file?.rows)).toEqual(["Own one"]);
    expect(asked.detail).toMatchObject({ status: "ready", rowsTotal: 1, rowsDone: 1 });
  });

  it("exports Everyone · Contacted · Goa matching 'Sharma', newest first", async () => {
    const other = randomUUID();
    const kept = await inOrg(async (tx) => {
      const made: string[] = [];
      for (const [name, stage, destinationId] of [
        ["Rahul Sharma", "contacted", goaId],
        ["Meera Sharma", "contacted", goaId],
        ["Rahul Sharma", "new", goaId],
        ["Ravi Verma", "contacted", goaId],
        ["Neha Sharma", "contacted", null],
      ] as const) {
        const person = await aPerson(tx, { name });
        made.push((await aLead(tx, { personId: person.id, ownerUserId: other, stage, destinationId })).id);
      }
      return made;
    });
    const asked = await makeExport(manager, {
      view: "everyone",
      stage: "contacted",
      destinationId: goaId,
      search: "Sharma",
    });
    expect(namesOf(asked.file?.rows)).toEqual(["Meera Sharma", "Rahul Sharma"]);
    expect(asked.file?.rows.map((row) => row.at(-1))).toEqual([
      `https://app.example.test/leads/${kept[1] ?? ""}`,
      `https://app.example.test/leads/${kept[0] ?? ""}`,
    ]);
    // The search is emptied once the file is made; the rest of the filter stays.
    expect(asked.detail.filter).toEqual({ view: "everyone", stage: "contacted", destinationId: goaId });
  });

  it("writes B38's columns in order: +91 98765 43210, Returning Yes, Dec 2026 or Flexible, '7, 4', the budget in rupees, the owner or Former member", async () => {
    const formerOwner = randomUUID();
    await inOrg(async (tx) => {
      const person = await aPerson(tx, {
        name: "Column Person",
        phoneE164: "+919876543210",
        email: "column@example.test",
        instagramHandle: "column.person",
      });
      await tx.lead.create({
        data: {
          personId: person.id,
          source: "bulk_upload",
          sourceDetail: "Oct sheet",
          stage: "quote_sent",
          returning: true,
          ownerUserId: sales.userId,
          destinationId: goaId,
          travelKind: "month",
          travelMonth: new Date("2026-12-01T00:00:00Z"),
          adults: 2,
          childrenAges: [7, 4],
          budgetPaise: 12_500_050n,
          budgetBasis: "per_person",
          departureCity: "Mumbai",
          tripType: "family",
          hotelCategory: "4_star",
          food: "veg",
          roomType: "Sea view",
        },
      });
      const flexible = await aPerson(tx, { name: "Flexible Person" });
      await aLead(tx, { personId: flexible.id, ownerUserId: formerOwner, travelKind: "flexible", source: "referral" });
    });
    const { file } = await makeExport(manager, { view: "everyone", search: "Person" });
    expect(file?.columns.map((column) => column.header)).toEqual([...leadExportHeaders]);
    const [flexibleRow, columnRow] = file?.rows ?? [];
    expect(columnRow?.slice(0, 23)).toEqual([
      "Column Person",
      "+91 98765 43210",
      "column@example.test",
      "column.person",
      "Yes",
      "Quote sent",
      "Goa",
      null,
      null,
      "Dec 2026",
      2,
      "7, 4",
      125000.5,
      "per person",
      "Mumbai",
      "Family",
      "4★",
      "Vegetarian",
      "Sea view",
      "Asha Rao",
      "Import",
      "Oct sheet",
      expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/),
    ]);
    expect(columnRow?.slice(23, 25)).toEqual([null, null]);
    expect([flexibleRow?.[9], flexibleRow?.[19], flexibleRow?.[20], flexibleRow?.[4]]).toEqual([
      "Flexible",
      "Former member",
      "Referral",
      null,
    ]);
  });

  it("writes Added on and Next follow-up as the agency's wall clock, and stamps the file name in its zone", async () => {
    const created = new Date("2026-10-19T18:20:00Z");
    const due = new Date("2026-10-20T18:45:00Z");
    await inOrg(async (tx) => {
      const person = await aPerson(tx, { name: "Clock Person" });
      const lead = await aLead(tx, { personId: person.id, createdAt: created });
      await aTask(tx, {
        kind: "follow-up",
        title: "Send the quote",
        dueAt: due,
        record: { recordType: "lead", recordId: lead.id },
      });
    });
    // 23:50 IST on 19 Oct is 18:20 UTC: the file is named for the agency's clock, not UTC's.
    vi.useFakeTimers({ toFake: ["Date"], now: created });
    const { file, detail } = await makeExport(manager, { view: "everyone", search: "Clock" });
    expect(file?.rows[0]?.slice(22, 25)).toEqual(["2026-10-19T23:50", "2026-10-21T00:15", "Send the quote"]);
    expect(detail.file?.fileName).toBe("leads-2026-10-19-2350.xlsx");
    const csv = await makeExport(manager, { view: "everyone", search: "Clock" }, { format: "csv" });
    expect(csv.detail.file?.fileName).toBe("leads-2026-10-19-2350.csv");
  });

  it("stops past its row limit with too_many_rows", async () => {
    const { detail } = await makeExport(manager, { view: "everyone" }, { maxRows: 1 });
    expect(detail).toMatchObject({ status: "failed", failureReason: "too_many_rows", file: null });
  });

  it("fails for a requester who lost leads:view", async () => {
    const lost = memberOf(organizationId, "accounts", { userId: manager.userId });
    const { detail } = await makeExport(manager, { view: "everyone" }, { access: lost });
    expect(detail).toMatchObject({ status: "failed", failureReason: "lost_permission" });
  });

  it("records export.made with the filter by ids and searched: true, never the search", async () => {
    const { exportId } = await makeExport(manager, { view: "everyone", destinationId: goaId, search: "Sharma" });
    const [entry] = await auditOf(test, organizationId, exportId);
    expect(entry?.action).toBe("export.made");
    expect(entry?.after).toMatchObject({
      kind: "leads",
      format: "xlsx",
      filter: { view: "everyone", stage: "open", destinationId: goaId, searched: true },
    });
    expect(JSON.stringify(entry)).not.toContain("Sharma");
  });

  it("imports back: the lead import's guesses read Added on as Enquiry date, and Returning and the follow-up columns as Don't import", () => {
    const guesses = guessFields("leads", [...leadExportHeaders], new Map());
    const byHeader = Object.fromEntries(leadExportHeaders.map((header, index) => [header, guesses[index]?.field]));
    expect(byHeader).toMatchObject({
      "Added on": "enquiry_date",
      Returning: null,
      "Next follow-up": null,
      "Next follow-up note": null,
      "Lead link": null,
    });
    // Every other column is a field of its own, so an export imports back whole.
    expect(guesses.filter((guess) => guess.field !== null)).toHaveLength(leadExportHeaders.length - 5);
  });
});
