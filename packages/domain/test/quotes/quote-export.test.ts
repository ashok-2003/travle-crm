// The quotes export (bookings revamp, 2026-11-27): the Quotes list as the person sees it into a file, the table's columns
// plus the customer's phone, last changed first; a draft behind an unpaid AI booking says Waiting for payment; its status
// chip, Filters and search applied; a salesperson's own quotes whatever they ask; the row limit; an audit entry without
// the search's text; and each kind's listener leaving the others' exports alone.
import type { OrgTx } from "@travel-crm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeBookingExportListener } from "../../src/bookings/index.js";
import {
  exportDetail,
  makeStaffExportListener,
  runExport,
  startExport,
  type ExportJobDependencies,
} from "../../src/exports/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import type { EventPayload } from "../../src/jobs/index.js";
import { makeQuoteExportListener, type PaymentWaits } from "../../src/quotes/index.js";
import { quoteExportSource } from "../../src/quotes/quote-export/quote-export-source.js";
import { fakeExportIdentity, requested } from "../exports/test-exports.js";
import {
  anAgency,
  auditOf,
  createTestImports,
  listenerContext,
  memberOf,
  type TestImports,
} from "../imports/support/test-imports.js";
import { aLead, aPerson } from "../crm/support/records.js";

describe("the quotes export", () => {
  let test: TestImports;
  let organizationId: string;
  let manager: MemberAccess;
  let sales: MemberAccess;
  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>) => test.db.forOrg(organizationId, work);
  const ids: Record<string, string> = {};

  const dependencies = (access: MemberAccess | null): ExportJobDependencies => ({
    files: test.files,
    spreadsheets: test.spreadsheets,
    identity: {
      ...fakeExportIdentity(access),
      memberContacts: (_organizationId, userIds) =>
        Promise.resolve(
          userIds.flatMap((userId) => (userId === sales.userId ? [{ userId, name: "Asha Rao", email: null }] : [])),
        ),
    },
    appUrl: "https://app.example.test",
  });

  /** The ai module's answer, as the worker hands it in: Meera's draft waits for a payment. */
  const paymentWaits: PaymentWaits = (_tx, quoteIds) =>
    Promise.resolve(new Map(quoteIds.flatMap((id) => (id === ids.meera ? [[id, "waiting" as const]] : []))));

  async function makeExport(asker: MemberAccess, filter: EventPayload, options: { maxRows?: number } = {}) {
    const { exportId } = await inOrg((tx) => startExport(tx, asker, "quotes", { format: "csv", filter }, new Date()));
    const written = test.spreadsheets.written.length;
    const event = requested(organizationId, exportId, "quotes");
    const context = listenerContext(test, organizationId);
    if (options.maxRows === undefined) {
      await makeQuoteExportListener(dependencies(asker), paymentWaits).handle(event, context);
    } else {
      const source = quoteExportSource(dependencies(asker), {
        timeZone: "Asia/Kolkata",
        paymentWaits,
        maxRows: options.maxRows,
      });
      await runExport(event, context, dependencies(asker), source);
    }
    const detail = await inOrg((tx) => exportDetail(tx, asker, "quotes", exportId));
    return { exportId, detail, file: test.spreadsheets.written.slice(written)[0] };
  }

  const customers = (rows: (string | number | null)[][] | undefined) => rows?.map((row) => row[0]);

  beforeAll(async () => {
    test = createTestImports();
    organizationId = await anAgency(test);
    manager = memberOf(organizationId, "org-admin");
    sales = memberOf(organizationId, "sales");
    await inOrg(async (tx) => {
      const make = async (
        key: string,
        seed: { name: string; phone: string; title: string; status?: string; changedAt: number; owner?: string },
      ) => {
        const person = await aPerson(tx, { name: seed.name, phoneE164: seed.phone });
        const lead = await aLead(tx, { personId: person.id, ownerUserId: seed.owner ?? sales.userId });
        const quote = await tx.quote.create({
          data: {
            leadId: lead.id,
            title: seed.title,
            status: seed.status ?? "draft",
            startDate: new Date("2026-12-20T00:00:00Z"),
            subtotalPaise: 50_000_00n,
            totalPaise: 50_000_00n,
            ...(seed.status === "accepted" && {
              acceptedAt: new Date("2026-10-29T05:00:00Z"),
              acceptedName: seed.name,
            }),
            updatedAt: new Date(Date.UTC(2026, 9, 29, 5, seed.changedAt)),
          },
          select: { id: true },
        });
        ids[key] = quote.id;
      };
      await make("meera", { name: "Meera Iyer", phone: "+919876500002", title: "Kerala backwaters", changedAt: 3 });
      await make("dev", {
        name: "Dev Patel",
        phone: "+919811122233",
        title: "Rajasthan forts",
        status: "accepted",
        changedAt: 2,
      });
      await make("theirs", {
        name: "Theirs",
        phone: "+919800000004",
        title: "Goa",
        changedAt: 1,
        owner: manager.userId,
      });
      await tx.quotePayment.create({
        data: { quoteId: ids.dev ?? "", amountPaise: 20_000_00n, receivedOn: new Date("2026-10-29"), method: "upi" },
      });
    });
  });

  afterAll(async () => {
    await test.close();
  });

  it("writes the table's columns and the customer's phone, last changed first", async () => {
    const { file, detail } = await makeExport(manager, {});
    expect(detail).toMatchObject({ status: "ready", rowsTotal: 3, rowsDone: 3 });
    expect(file?.columns.map((column) => column.header)).toEqual([
      "Customer",
      "Phone",
      "Trip",
      "Travel date",
      "Status",
      "Total",
      "Paid",
      "To pay",
      "Last change",
      "Salesperson",
      "Quote link",
    ]);
    expect(customers(file?.rows)).toEqual(["Meera Iyer", "Dev Patel", "Theirs"]);
    expect(file?.rows[0]).toEqual([
      "Meera Iyer",
      "+91 98765 00002",
      "Kerala backwaters",
      "2026-12-20",
      "Waiting for payment",
      50000,
      0,
      50000,
      "2026-10-29T10:33",
      "Asha Rao",
      `https://app.example.test/quotes/${ids.meera ?? ""}`,
    ]);
    expect(file?.rows[1]?.slice(4, 8)).toEqual(["Accepted", 50000, 20000, 30000]);
    expect(file?.rows[2]?.[9]).toBe("Former member");
  });

  it("applies the list's status chip, Filters and search", async () => {
    expect(customers((await makeExport(manager, { search: "kerala" })).file?.rows)).toEqual(["Meera Iyer"]);
    expect(customers((await makeExport(manager, { search: "98111 22233" })).file?.rows)).toEqual(["Dev Patel"]);
    expect(customers((await makeExport(manager, { balanceDue: true })).file?.rows)).toEqual(["Dev Patel"]);
    expect(customers((await makeExport(manager, { status: "draft" })).file?.rows)).toEqual(["Meera Iyer", "Theirs"]);
    expect(customers((await makeExport(manager, { ownerUserId: manager.userId })).file?.rows)).toEqual(["Theirs"]);
  });

  it("holds a salesperson to their own quotes, whatever they ask", async () => {
    const asked = await makeExport(sales, { ownerUserId: manager.userId });
    expect(customers(asked.file?.rows)).toEqual(["Meera Iyer", "Dev Patel"]);
  });

  it("stops past its row limit, as the leads export does", async () => {
    const asked = await makeExport(manager, {}, { maxRows: 2 });
    expect(asked.detail).toMatchObject({ status: "failed", failureReason: "too_many_rows" });
  });

  it("records the filter without the search's text, and keeps the filter without it", async () => {
    const { exportId, detail } = await makeExport(manager, { search: "Meera", status: "draft" });
    const [entry] = (await auditOf(test, organizationId, exportId)).filter((one) => one.action === "export.made");
    expect(entry?.after).toMatchObject({ kind: "quotes", rows: 1, filter: { status: "draft", searched: true } });
    expect(JSON.stringify(entry?.after)).not.toContain("Meera");
    expect(detail.filter).toEqual({ status: "draft" });
  });

  it("is left alone by the bookings' and staff's listeners, and leaves a bookings export alone", async () => {
    const asked = (kind: "bookings" | "quotes") =>
      inOrg((tx) => startExport(tx, manager, kind, { format: "csv", filter: {} }, new Date()));
    const context = listenerContext(test, organizationId);
    const quotes = await asked("quotes");
    await makeBookingExportListener(dependencies(manager)).handle(
      requested(organizationId, quotes.exportId, "quotes"),
      context,
    );
    await makeStaffExportListener(dependencies(manager)).handle(
      requested(organizationId, quotes.exportId, "quotes"),
      context,
    );
    const bookings = await asked("bookings");
    await makeQuoteExportListener(dependencies(manager), paymentWaits).handle(
      requested(organizationId, bookings.exportId, "bookings"),
      context,
    );
    for (const [kind, exportId] of [
      ["quotes", quotes.exportId],
      ["bookings", bookings.exportId],
    ] as const) {
      expect((await inOrg((tx) => exportDetail(tx, manager, kind, exportId))).status).toBe("making");
    }
  });
});
