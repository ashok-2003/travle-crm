// Invoices made by hand in the console: numbering, financial years, GST, the frozen seller snapshot, cancelling, and a
// failed create that leaves nothing behind. A fake renderer records what the PDF is given.
import { randomUUID } from "node:crypto";
import { gstinCheckCharacter } from "@travel-crm/contracts/kernel";
import {
  setBillingDetailsInput,
  type CreateInvoiceInput,
  type SetBillingDetailsInput,
} from "@travel-crm/contracts/platform";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import type { PlatformInvoiceData } from "@travel-crm/integrations/pdf";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import {
  cancelInvoice,
  createInvoice,
  getBillingDetails,
  getInvoice,
  invoiceDownloadLink,
  listInvoices,
  listPlatformLog,
  setBillingDetails,
  type PlatformServices,
} from "../../src/platform/index.js";
import { createTestPlatform, type TestPlatform } from "./test-platform.js";

const staff = { userId: "0199e7a0-0000-7000-8000-00000000a0a1" };

/** A GSTIN with a correct check character, built from a made-up PAN. */
function testGstin(stateCode: string): string {
  const first14 = `${stateCode}ABCDE1234F1Z`;
  return `${first14}${gstinCheckCharacter(first14)}`;
}

function billing(overrides: Partial<SetBillingDetailsInput> = {}): SetBillingDetailsInput {
  return setBillingDetailsInput.parse({
    legalName: "Test Firm",
    address: "1 Test Street, Testville",
    stateCode: "29",
    gstin: testGstin("29"),
    bankAccountName: "Test Firm",
    bankAccountNumber: "000011112222",
    bankIfsc: "TEST0000001",
    upiId: "test@upi",
    defaultTerms: "Pay within 7 days.",
    proformaPrefix: "PI",
    invoicePrefix: "INV",
    ...overrides,
  });
}

/** Each test counts in a financial year of its own, so the shared database's counters never meet. */
let nextYear = 2100;
let year: number;

function invoice(overrides: Partial<CreateInvoiceInput> = {}): CreateInvoiceInput {
  return {
    kind: "proforma",
    issuedOn: `${String(year)}-06-15`,
    billTo: { name: "Acme Holidays" },
    lines: [{ description: "Starter plan, 3 months", amountPaise: 1_000_000 }],
    gstRateBasisPoints: 0,
    ...overrides,
  };
}

describe("platform invoices", () => {
  let test: TestPlatform;
  let platformClient: PlatformClient;
  let services: PlatformServices;
  let rendered: PlatformInvoiceData[];

  beforeAll(() => {
    test = createTestPlatform();
    platformClient = createPlatformClient(inject("dbUrls").platform);
  });

  afterAll(async () => {
    await platformClient.$disconnect();
    await test.close();
  });

  beforeEach(async () => {
    year = nextYear;
    nextYear += 2;
    rendered = [];
    services = {
      ...test.services,
      renderInvoice: (data) => {
        rendered.push(data);
        return Promise.resolve(new Uint8Array([1]));
      },
    };
    await setBillingDetails(services, staff, billing());
  });

  it("numbers each type on its own, in order", async () => {
    const first = await createInvoice(services, staff, invoice());
    const second = await createInvoice(services, staff, invoice());
    const real = await createInvoice(services, staff, invoice({ kind: "invoice" }));
    const fy = `${String(year)}-${String(year + 1).slice(2)}`;
    expect([first.number, second.number, real.number]).toEqual([`PI/${fy}/001`, `PI/${fy}/002`, `INV/${fy}/001`]);
  });

  it("gives two creates at the same moment two different consecutive numbers", async () => {
    const both = await Promise.all([
      createInvoice(services, staff, invoice()),
      createInvoice(services, staff, invoice()),
    ]);
    expect(both.map((made) => made.sequence).sort()).toEqual([1, 2]);
  });

  it("restarts at 001 on 1 April, and keeps 31 March in the year before", async () => {
    const march = await createInvoice(services, staff, invoice({ issuedOn: `${String(year)}-03-31` }));
    const april = await createInvoice(services, staff, invoice({ issuedOn: `${String(year)}-04-01` }));
    expect([march.financialYear, april.financialYear]).toEqual([
      `${String(year - 1)}-${String(year).slice(2)}`,
      `${String(year)}-${String(year + 1).slice(2)}`,
    ]);
    expect([march.sequence, april.sequence]).toEqual([1, 1]);
  });

  it("leaves no row and uses no number when the renderer throws", async () => {
    const failing = { ...services, renderInvoice: () => Promise.reject(new Error("render failed")) };
    await expect(createInvoice(failing, staff, invoice())).rejects.toThrow("render failed");
    const next = await createInvoice(services, staff, invoice());
    expect(next.sequence).toBe(1);
    expect(await platformClient.platformInvoice.count({ where: { financialYear: next.financialYear } })).toBe(1);
  });

  it("leaves no number used when storage throws", async () => {
    const failing = { ...services, storage: { ...test.storage, put: () => Promise.reject(new Error("storage down")) } };
    await expect(createInvoice(failing as PlatformServices, staff, invoice())).rejects.toThrow("storage down");
    expect((await createInvoice(services, staff, invoice())).sequence).toBe(1);
  });

  it("splits GST into CGST and SGST in the firm's state, IGST elsewhere, and none without GST", async () => {
    const same = await createInvoice(
      services,
      staff,
      invoice({ gstRateBasisPoints: 1800, billTo: { name: "Acme Holidays", stateCode: "29" } }),
    );
    expect(same).toMatchObject({
      subtotalPaise: 1_000_000,
      cgstPaise: 90_000,
      sgstPaise: 90_000,
      igstPaise: 0,
      totalPaise: 1_180_000,
    });
    const other = await createInvoice(
      services,
      staff,
      invoice({ gstRateBasisPoints: 1800, billTo: { name: "Acme Holidays", stateCode: "27" } }),
    );
    expect(other).toMatchObject({ cgstPaise: 0, sgstPaise: 0, igstPaise: 180_000, totalPaise: 1_180_000 });
    const none = await createInvoice(services, staff, invoice());
    expect(none).toMatchObject({ cgstPaise: 0, sgstPaise: 0, igstPaise: 0, totalPaise: 1_000_000 });
  });

  it("refuses GST with no GSTIN saved or no billed-to state, and any invoice with no billing details", async () => {
    await setBillingDetails(services, staff, billing({ gstin: undefined }));
    await expect(
      createInvoice(services, staff, invoice({ gstRateBasisPoints: 500, billTo: { name: "A", stateCode: "29" } })),
    ).rejects.toMatchObject({ reason: "GST_NEEDS_GSTIN" });
    await setBillingDetails(services, staff, billing());
    await expect(createInvoice(services, staff, invoice({ gstRateBasisPoints: 500 }))).rejects.toMatchObject({
      reason: "GST_NEEDS_STATE",
    });
    // Nothing used a number.
    expect((await createInvoice(services, staff, invoice())).sequence).toBe(1);
    await platformClient.platformBillingDetails.deleteMany();
    await expect(createInvoice(services, staff, invoice())).rejects.toMatchObject({
      reason: "BILLING_DETAILS_MISSING",
    });
    expect(await getBillingDetails(services)).toBeNull();
  });

  it("refuses to make an invoice on a server with no renderer", async () => {
    const without: PlatformServices = { ...test.services };
    await expect(createInvoice(without, staff, invoice())).rejects.toMatchObject({ reason: "PDF_RENDERER_MISSING" });
  });

  it("gives the renderer the title, the words, the seller without an unset GSTIN, and no payment box without bank or UPI", async () => {
    await setBillingDetails(
      services,
      staff,
      billing({
        gstin: undefined,
        bankAccountName: undefined,
        bankAccountNumber: undefined,
        bankIfsc: undefined,
        upiId: undefined,
      }),
    );
    await createInvoice(services, staff, invoice({ kind: "invoice", dueOn: `${String(year)}-06-22`, notes: "Thanks" }));
    const [data] = rendered;
    expect(data).toMatchObject({
      title: "Invoice",
      totalInWords: "Rupees Ten Thousand Only",
      payment: null,
      notes: "Thanks",
      signatory: "For Test Firm",
      seller: { name: "Test Firm", lines: ["1 Test Street, Testville"] },
      totals: [
        { label: "Subtotal", amount: "₹10,000.00" },
        { label: "Total", amount: "₹10,000.00", emphasis: true },
      ],
    });
    expect(data?.dueOn).toMatch(/22 Jun/);
  });

  it("titles a proforma 'Proforma Invoice' and an invoice with GST 'Tax Invoice', with the payment box", async () => {
    await createInvoice(services, staff, invoice());
    await createInvoice(
      services,
      staff,
      invoice({ kind: "invoice", gstRateBasisPoints: 1800, billTo: { name: "A", stateCode: "29" } }),
    );
    expect(rendered.map((data) => data.title)).toEqual(["Proforma Invoice", "Tax Invoice"]);
    expect(rendered[1]?.payment?.lines).toEqual([
      "Account name: Test Firm",
      "Account number: 000011112222",
      "IFSC: TEST0000001",
      "UPI: test@upi",
    ]);
    expect(rendered[1]?.totals.map((total) => total.label)).toEqual(["Subtotal", "CGST 9%", "SGST 9%", "Total"]);
  });

  it("keeps the first invoice's seller snapshot and PDF when the billing details change", async () => {
    const made = await createInvoice(services, staff, invoice());
    await setBillingDetails(services, staff, billing({ legalName: "Renamed Firm", upiId: "new@upi" }));
    const again = await getInvoice(services, made.id);
    expect(again.seller).toMatchObject({ legalName: "Test Firm", upiId: "test@upi" });
    const { url } = await invoiceDownloadLink(services, made.id);
    expect(url).toContain(encodeURIComponent(`platform/invoices/${made.financialYear}/${made.id}.pdf`));
    expect(await test.storage.get(`platform/invoices/${made.financialYear}/${made.id}.pdf`)).toEqual(
      new Uint8Array([1]),
    );
  });

  it("cancels once, with a reason, and never gives the number again", async () => {
    const made = await createInvoice(services, staff, invoice());
    const cancelled = await cancelInvoice(services, staff, { invoiceId: made.id, reason: "Wrong amount" });
    expect(cancelled).toMatchObject({ status: "cancelled", cancelReason: "Wrong amount" });
    await expect(cancelInvoice(services, staff, { invoiceId: made.id, reason: "Again" })).rejects.toMatchObject({
      reason: "ALREADY_CANCELLED",
    });
    expect((await createInvoice(services, staff, invoice())).sequence).toBe(2);
    await expect(getInvoice(services, randomUUID())).rejects.toMatchObject({ reason: "NOT_FOUND" });
  });

  it("freezes an issued invoice in the database, and lets nobody delete one", async () => {
    const made = await createInvoice(services, staff, invoice());
    await expect(
      platformClient.platformInvoice.update({ where: { id: made.id }, data: { totalPaise: 1 } }),
    ).rejects.toThrow();
    await expect(platformClient.platformInvoice.delete({ where: { id: made.id } })).rejects.toThrow();
  });

  it("lists newest first in pages", async () => {
    const first = await createInvoice(services, staff, invoice());
    const second = await createInvoice(services, staff, invoice());
    const page = await listInvoices(services, { limit: 1 });
    expect(page.invoices.map((summary) => summary.id)).toEqual([second.id]);
    expect(page.nextCursor).toBe(second.id);
    const next = await listInvoices(services, { limit: 1, before: page.nextCursor ?? undefined });
    expect(next.invoices.map((summary) => summary.id)).toEqual([first.id]);
  });

  it("logs billing-details changes by field name only, and each create and cancel", async () => {
    await setBillingDetails(services, staff, billing({ bankAccountNumber: "999988887777", legalName: "Logged Firm" }));
    const made = await createInvoice(services, staff, invoice());
    await cancelInvoice(services, staff, { invoiceId: made.id, reason: "Test" });
    const log = await services.platformDb.transaction((tx) => listPlatformLog(tx, { limit: 20 }));
    const mine = log.entries.filter(
      (entry) => entry.targetId === made.id || entry.action === "billing-details.changed",
    );
    expect(mine.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(["billing-details.changed", "invoice.created", "invoice.cancelled"]),
    );
    const changed = log.entries.find((entry) => entry.action === "billing-details.changed");
    expect(changed?.after).toEqual({ changed: ["legalName", "bankAccountNumber"] });
    expect(JSON.stringify(log.entries)).not.toContain("999988887777");
  });
});
