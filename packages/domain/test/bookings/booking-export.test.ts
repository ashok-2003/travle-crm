// The bookings export (bookings revamp, 2026-11-27): the Bookings list as the person sees it into a file, the table's
// columns plus the customer's phone, in the list's order (travel date soonest first, no date last); its status chip,
// Filters and search applied, its payment state by the domain's own rule; a salesperson's own bookings whatever they ask;
// the row limit; an audit entry without the search's text; and each kind's listener leaving the others' exports alone.
import type { OrgTx } from "@travel-crm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBookingFromQuote, makeBookingExportListener } from "../../src/bookings/index.js";
import { bookingExportSource } from "../../src/bookings/booking-export/booking-export-source.js";
import { makeLeadExportListener } from "../../src/crm/index.js";
import {
  exportDetail,
  makeStaffExportListener,
  runExport,
  startExport,
  type ExportJobDependencies,
} from "../../src/exports/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import type { EventPayload } from "../../src/jobs/index.js";
import { recordPayment } from "../../src/quotes/index.js";
import { leadsToShow } from "../../src/today/index.js";
import { fakeExportIdentity, requested } from "../exports/test-exports.js";
import {
  anAgency,
  auditOf,
  createTestImports,
  listenerContext,
  memberOf,
  type TestImports,
} from "../imports/support/test-imports.js";
import { aQuote } from "./support.js";

describe("the bookings export", () => {
  let test: TestImports;
  let organizationId: string;
  let manager: MemberAccess;
  let sales: MemberAccess;
  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>) => test.db.forOrg(organizationId, work);

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

  /** A booking of this customer's on a trip starting that day, the salesperson's unless another owns its lead. */
  const aBooking = (seed: { name: string; phone: string; startDate: string | null; ownerUserId?: string }) =>
    inOrg(async (tx) => {
      const { quote, lead } = await aQuote(tx, {
        ownerUserId: seed.ownerUserId ?? sales.userId,
        startDate: seed.startDate,
        totalPaise: 1_00_000_00,
        adults: 2,
        children: 1,
      });
      await tx.person.update({ where: { id: lead.personId }, data: { name: seed.name, phoneE164: seed.phone } });
      const bookingId = await createBookingFromQuote(
        tx,
        { organizationId, quoteId: quote.id, confirmed: true },
        new Date("2026-10-29T06:30:00Z"),
      );
      if (bookingId === null) throw new Error("The booking was not made");
      return { bookingId, quoteId: quote.id };
    });

  /** Asks for an export as `asker` and makes it as the worker would. */
  async function makeExport(asker: MemberAccess, filter: EventPayload, options: { maxRows?: number } = {}) {
    const { exportId } = await inOrg((tx) =>
      startExport(tx, asker, "bookings", { format: "xlsx", filter }, new Date()),
    );
    const written = test.spreadsheets.written.length;
    const event = requested(organizationId, exportId, "bookings");
    const context = listenerContext(test, organizationId);
    if (options.maxRows === undefined) {
      await makeBookingExportListener(dependencies(asker)).handle(event, context);
    } else {
      const source = bookingExportSource(dependencies(asker), { timeZone: "Asia/Kolkata", maxRows: options.maxRows });
      await runExport(event, context, dependencies(asker), source);
    }
    const detail = await inOrg((tx) => exportDetail(tx, asker, "bookings", exportId));
    return { exportId, detail, file: test.spreadsheets.written.slice(written)[0] };
  }

  const customers = (rows: (string | number | null)[][] | undefined) => rows?.map((row) => row[1]);

  let meera: { bookingId: string; quoteId: string };
  beforeAll(async () => {
    test = createTestImports();
    organizationId = await anAgency(test);
    manager = memberOf(organizationId, "org-admin");
    sales = memberOf(organizationId, "sales");
    meera = await aBooking({ name: "Meera Iyer", phone: "+919876500002", startDate: "2027-01-10" });
    await aBooking({ name: "Dev Patel", phone: "+919811122233", startDate: "2026-12-20" });
    await aBooking({ name: "No date", phone: "+919800000003", startDate: null });
    await aBooking({ name: "Theirs", phone: "+919800000004", startDate: "2026-12-01", ownerUserId: manager.userId });
    await inOrg((tx) =>
      recordPayment(
        tx,
        manager,
        {
          quoteId: meera.quoteId,
          amountPaise: 30_000_00,
          receivedOn: "2026-10-29",
          method: "upi",
          reference: "UTR",
          requestId: crypto.randomUUID(),
        },
        new Date("2026-10-29T06:30:00Z"),
      ),
    );
  });

  afterAll(async () => {
    await test.close();
  });

  it("writes the table's columns and the customer's phone, by travel date soonest first, no date last", async () => {
    const { file, detail } = await makeExport(manager, {});
    expect(detail).toMatchObject({ status: "ready", rowsTotal: 4, rowsDone: 4 });
    expect(file?.columns.map((column) => column.header)).toEqual([
      "Booking",
      "Customer",
      "Phone",
      "Trip",
      "Departure",
      "Travel date",
      "Adults",
      "Children",
      "Status",
      "Total",
      "Paid",
      "To pay",
      "Payment",
      "Payments to check",
      "Refund due",
      "Travellers",
      "Details filled",
      "Salesperson",
      "Booking link",
    ]);
    expect(customers(file?.rows)).toEqual(["Theirs", "Dev Patel", "Meera Iyer", "No date"]);
    const row = file?.rows.find((cells) => cells[1] === "Meera Iyer");
    expect(row).toEqual([
      expect.stringMatching(/^BK-\d{4}-\d{4}$/),
      "Meera Iyer",
      "+91 98765 00002",
      "Spiti 6 days",
      null,
      "2027-01-10",
      2,
      1,
      "Confirmed",
      100000,
      30000,
      70000,
      "Part paid",
      0,
      0,
      3,
      0,
      "Asha Rao",
      `https://app.example.test/bookings/${meera.bookingId}`,
    ]);
    // A salesperson who is no longer a member is named as one.
    expect(file?.rows.find((cells) => cells[1] === "Theirs")?.[17]).toBe("Former member");
  });

  it("applies the list's status chip, Filters and search, and the payment rule", async () => {
    expect(customers((await makeExport(manager, { search: "meera" })).file?.rows)).toEqual(["Meera Iyer"]);
    expect(customers((await makeExport(manager, { search: "98111 22233" })).file?.rows)).toEqual(["Dev Patel"]);
    expect(customers((await makeExport(manager, { payment: "part_paid" })).file?.rows)).toEqual(["Meera Iyer"]);
    expect(customers((await makeExport(manager, { travelFrom: "2026-12-15" })).file?.rows)).toEqual([
      "Dev Patel",
      "Meera Iyer",
    ]);
    expect(customers((await makeExport(manager, { ownerUserId: manager.userId })).file?.rows)).toEqual(["Theirs"]);
    expect((await makeExport(manager, { status: "requested" })).detail).toMatchObject({
      status: "ready",
      rowsTotal: 0,
    });
  });

  it("holds a salesperson to their own bookings, whatever they ask", async () => {
    const asked = await makeExport(sales, { ownerUserId: manager.userId });
    expect(customers(asked.file?.rows)).toEqual(["Dev Patel", "Meera Iyer", "No date"]);
  });

  it("stops past its row limit, as the leads export does", async () => {
    const asked = await makeExport(manager, {}, { maxRows: 3 });
    expect(asked.detail).toMatchObject({ status: "failed", failureReason: "too_many_rows" });
  });

  it("records the filter without the search's text, and keeps the filter without it", async () => {
    const { exportId, detail } = await makeExport(manager, { search: "Meera", payment: "part_paid" });
    const [entry] = (await auditOf(test, organizationId, exportId)).filter((one) => one.action === "export.made");
    expect(entry?.after).toMatchObject({ kind: "bookings", rows: 1, filter: { payment: "part_paid", searched: true } });
    expect(JSON.stringify(entry?.after)).not.toContain("Meera");
    expect(detail.filter).toEqual({ payment: "part_paid" });
  });

  it("is left alone by the leads' and staff's listeners, and leaves theirs alone", async () => {
    const asked = (kind: "bookings" | "leads", filter: EventPayload) =>
      inOrg((tx) => startExport(tx, manager, kind, { format: "csv", filter }, new Date()));
    const context = listenerContext(test, organizationId);
    const bookings = await asked("bookings", {});
    await makeLeadExportListener(dependencies(manager), leadsToShow).handle(
      requested(organizationId, bookings.exportId, "bookings"),
      context,
    );
    await makeStaffExportListener(dependencies(manager)).handle(
      requested(organizationId, bookings.exportId, "bookings"),
      context,
    );
    const leads = await asked("leads", { view: "everyone", stage: "open" });
    await makeBookingExportListener(dependencies(manager)).handle(requested(organizationId, leads.exportId), context);
    for (const [kind, exportId] of [
      ["bookings", bookings.exportId],
      ["leads", leads.exportId],
    ] as const) {
      expect((await inOrg((tx) => exportDetail(tx, manager, kind, exportId))).status).toBe("making");
    }
  });
});
