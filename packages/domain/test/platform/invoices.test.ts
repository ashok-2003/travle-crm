// Invoices made by hand in the console: numbering, financial years, GST, the frozen seller snapshot, cancelling, and a
// failed create that leaves nothing behind. A fake renderer records what the PDF is given.
import { randomUUID } from "node:crypto";
import { gstinCheckCharacter } from "@travel-crm/contracts/kernel";
import {
  billingImageUploadLinkInput,
  createInvoiceInput,
  setBillingDetailsInput,
  type CreateInvoiceInput,
  type SetBillingDetailsInput,
} from "@travel-crm/contracts/platform";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import type { PlatformInvoiceData } from "@travel-crm/integrations/pdf";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import {
  billingImageLink,
  billingImageUploadLink,
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
import { testPng } from "./test-png.js";

const imageKey = (kind: "logo" | "signature", extension = "png") =>
  `platform/billing/${kind}-${randomUUID()}.${extension}`;

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
    lines: [{ description: "Starter plan, 3 months", quantity: 1, ratePaise: 1_000_000 }],
    gstRateBasisPoints: 0,
    ...overrides,
  };
}

/** Creates as of mid-June of the test's own year, so the date window (30 days ahead, back to last year) holds. */
const create = (services: PlatformServices, staff: { userId: string }, input: CreateInvoiceInput) =>
  createInvoice(services, staff, input, new Date(`${String(year)}-06-20T12:00:00Z`));

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
    const first = await create(services, staff, invoice());
    const second = await create(services, staff, invoice());
    const real = await create(services, staff, invoice({ kind: "invoice" }));
    const fy = `${String(year)}-${String(year + 1).slice(2)}`;
    expect([first.number, second.number, real.number]).toEqual([`PI/${fy}/001`, `PI/${fy}/002`, `INV/${fy}/001`]);
  });

  it("gives two creates at the same moment two different consecutive numbers", async () => {
    const both = await Promise.all([create(services, staff, invoice()), create(services, staff, invoice())]);
    expect(both.map((made) => made.sequence).sort()).toEqual([1, 2]);
  });

  it("restarts at 001 on 1 April, and keeps 31 March in the year before", async () => {
    const march = await create(services, staff, invoice({ issuedOn: `${String(year)}-03-31` }));
    const april = await create(services, staff, invoice({ issuedOn: `${String(year)}-04-01` }));
    expect([march.financialYear, april.financialYear]).toEqual([
      `${String(year - 1)}-${String(year).slice(2)}`,
      `${String(year)}-${String(year + 1).slice(2)}`,
    ]);
    expect([march.sequence, april.sequence]).toEqual([1, 1]);
  });

  it("leaves no row and uses no number when the renderer throws", async () => {
    const failing = { ...services, renderInvoice: () => Promise.reject(new Error("render failed")) };
    await expect(create(failing, staff, invoice())).rejects.toThrow("render failed");
    const next = await create(services, staff, invoice());
    expect(next.sequence).toBe(1);
    expect(await platformClient.platformInvoice.count({ where: { financialYear: next.financialYear } })).toBe(1);
  });

  it("leaves no number used when storage throws", async () => {
    const failing = { ...services, storage: { ...test.storage, put: () => Promise.reject(new Error("storage down")) } };
    await expect(create(failing as PlatformServices, staff, invoice())).rejects.toThrow("storage down");
    expect((await create(services, staff, invoice())).sequence).toBe(1);
  });

  it("splits GST into CGST and SGST in the firm's state, IGST elsewhere, and none without GST", async () => {
    const same = await create(
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
    const other = await create(
      services,
      staff,
      invoice({ gstRateBasisPoints: 1800, billTo: { name: "Acme Holidays", stateCode: "27" } }),
    );
    expect(other).toMatchObject({ cgstPaise: 0, sgstPaise: 0, igstPaise: 180_000, totalPaise: 1_180_000 });
    const none = await create(services, staff, invoice());
    expect(none).toMatchObject({ cgstPaise: 0, sgstPaise: 0, igstPaise: 0, totalPaise: 1_000_000 });
  });

  it("refuses GST with no GSTIN saved or no billed-to state, and any invoice with no billing details", async () => {
    await setBillingDetails(services, staff, billing({ gstin: undefined }));
    await expect(
      create(services, staff, invoice({ gstRateBasisPoints: 500, billTo: { name: "A", stateCode: "29" } })),
    ).rejects.toMatchObject({ reason: "GST_NEEDS_GSTIN" });
    await setBillingDetails(services, staff, billing());
    await expect(create(services, staff, invoice({ gstRateBasisPoints: 500 }))).rejects.toMatchObject({
      reason: "GST_NEEDS_STATE",
    });
    // Nothing used a number.
    expect((await create(services, staff, invoice())).sequence).toBe(1);
    await platformClient.platformBillingDetails.deleteMany();
    await expect(create(services, staff, invoice())).rejects.toMatchObject({
      reason: "BILLING_DETAILS_MISSING",
    });
    expect(await getBillingDetails(services)).toBeNull();
  });

  it("refuses to make an invoice on a server with no renderer", async () => {
    const without: PlatformServices = { ...test.services };
    await expect(create(without, staff, invoice())).rejects.toMatchObject({ reason: "PDF_RENDERER_MISSING" });
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
    await create(services, staff, invoice({ kind: "invoice", dueOn: `${String(year)}-06-22`, notes: "Thanks" }));
    const [data] = rendered;
    expect(data).toMatchObject({
      title: "Invoice",
      totalInWords: "Rupees Ten Thousand Only",
      payment: null,
      notes: "Thanks",
      signatory: { firm: "Test Firm" },
      seller: { name: "Test Firm" },
      totals: [
        { label: "Subtotal", amount: "₹10,000.00" },
        { label: "Total", amount: "₹10,000.00", emphasis: true },
      ],
    });
    expect(data?.dueOn).toMatch(/22 Jun/);
    expect(data?.seller.lines).toEqual(["1 Test Street, Testville"]);
    expect(data?.seller.stateLine).toBe("Karnataka (State code: 29)");
    expect(data?.billTo.stateLine).toBeUndefined();
    expect(data?.footer).toBe("Test Firm · 1 Test Street, Testville");
  });

  it("titles a proforma 'Proforma Invoice' and an invoice with GST 'Tax Invoice', with the payment box", async () => {
    await create(services, staff, invoice());
    await create(
      services,
      staff,
      invoice({ kind: "invoice", gstRateBasisPoints: 1800, billTo: { name: "A", stateCode: "29" } }),
    );
    expect(rendered.map((data) => data.title)).toEqual(["Proforma Invoice", "Tax Invoice"]);
    expect(rendered[1]?.payment?.rows).toEqual([
      { label: "Account name", value: "Test Firm" },
      { label: "Account number", value: "000011112222" },
      { label: "IFSC", value: "TEST0000001" },
      { label: "UPI ID", value: "test@upi" },
    ]);
    expect(rendered[1]?.totals.map((total) => total.label)).toEqual(["Subtotal", "CGST 9%", "SGST 9%", "Total"]);
  });

  it("keeps the first invoice's seller snapshot and PDF when the billing details change", async () => {
    const made = await create(services, staff, invoice());
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
    const made = await create(services, staff, invoice());
    const cancelled = await cancelInvoice(services, staff, { invoiceId: made.id, reason: "Wrong amount" });
    expect(cancelled).toMatchObject({ status: "cancelled", cancelReason: "Wrong amount" });
    await expect(cancelInvoice(services, staff, { invoiceId: made.id, reason: "Again" })).rejects.toMatchObject({
      reason: "ALREADY_CANCELLED",
    });
    expect((await create(services, staff, invoice())).sequence).toBe(2);
    await expect(getInvoice(services, randomUUID())).rejects.toMatchObject({ reason: "NOT_FOUND" });
  });

  it("freezes an issued invoice in the database, and lets nobody delete one", async () => {
    const made = await create(services, staff, invoice());
    await expect(
      platformClient.platformInvoice.update({ where: { id: made.id }, data: { totalPaise: 1 } }),
    ).rejects.toThrow(/cannot be changed/);
    await expect(platformClient.platformInvoice.delete({ where: { id: made.id } })).rejects.toThrow();
  });

  it("refuses a cancel that also changes another column, and a cancelled invoice issued again", async () => {
    const made = await create(services, staff, invoice());
    const cancel = { status: "cancelled", cancelledAt: new Date(), cancelledBy: staff.userId, cancelReason: "x" };
    await expect(
      platformClient.platformInvoice.update({ where: { id: made.id }, data: { ...cancel, pdfKey: "other.pdf" } }),
    ).rejects.toThrow(/cannot be changed/);
    await expect(
      platformClient.platformInvoice.update({ where: { id: made.id }, data: { ...cancel, totalPaise: 1 } }),
    ).rejects.toThrow(/cannot be changed/);
    await cancelInvoice(services, staff, { invoiceId: made.id, reason: "Wrong amount" });
    await expect(
      platformClient.platformInvoice.update({
        where: { id: made.id },
        data: { status: "issued", cancelledAt: null, cancelledBy: null, cancelReason: null },
      }),
    ).rejects.toThrow(/cannot be changed/);
  });

  it("keeps the invoice tables out of reach of the api and the worker", async () => {
    const db = test.services.db;
    await expect(db.withoutOrg((tx) => tx.platformInvoice.count())).rejects.toThrow(/permission denied/);
    await expect(db.withoutOrg((tx) => tx.platformInvoiceCounter.count())).rejects.toThrow(/permission denied/);
    await expect(db.withoutOrg((tx) => tx.platformBillingDetails.count())).rejects.toThrow(/permission denied/);
  });

  it("refuses equal prefixes, in the contract and in the database", async () => {
    expect(setBillingDetailsInput.safeParse({ ...billing(), invoicePrefix: "PI" }).success).toBe(false);
    expect(setBillingDetailsInput.parse({ ...billing(), invoicePrefix: "inv" }).invoicePrefix).toBe("INV");
    await expect(
      platformClient.platformBillingDetails.update({ where: { id: true }, data: { invoicePrefix: "PI" } }),
    ).rejects.toThrow(/platform_billing_details_prefixes_differ/);
  });

  it("refuses characters the PDF can't show, at save and before a number is used", async () => {
    await expect(
      setBillingDetails(services, staff, billing({ defaultTerms: "Pay soon \u{1F600}" })),
    ).rejects.toMatchObject({ reason: "UNPRINTABLE_CHARACTERS" });
    await expect(create(services, staff, invoice({ billTo: { name: "Acme\tHolidays" } }))).rejects.toMatchObject({
      reason: "UNPRINTABLE_CHARACTERS",
    });
    expect((await create(services, staff, invoice())).sequence).toBe(1);
  });

  it("refuses a date far ahead or before last financial year, and takes the edges", async () => {
    const reason = { reason: "INVOICE_DATE_OUT_OF_RANGE" };
    await expect(create(services, staff, invoice({ issuedOn: `${String(year)}-07-21` }))).rejects.toMatchObject(reason);
    await expect(create(services, staff, invoice({ issuedOn: `${String(year - 1)}-03-31` }))).rejects.toMatchObject(
      reason,
    );
    await create(services, staff, invoice({ issuedOn: `${String(year)}-07-20` }));
    await create(services, staff, invoice({ issuedOn: `${String(year - 1)}-04-01` }));
  });

  it("refuses a due date before the invoice date and a line above ten crore", () => {
    const parsed = (overrides: Partial<CreateInvoiceInput>) => createInvoiceInput.safeParse(invoice(overrides));
    expect(parsed({ dueOn: `${String(year)}-06-14` }).success).toBe(false);
    expect(parsed({ dueOn: `${String(year)}-06-15` }).success).toBe(true);
    expect(parsed({ lines: [{ description: "x", quantity: 1, ratePaise: 1_000_000_001 }] }).success).toBe(false);
    expect(parsed({ lines: [{ description: "x", quantity: 1, ratePaise: 1_000_000_000 }] }).success).toBe(true);
    // The cap is on the amount: 2 × ₹10 crore is refused.
    expect(parsed({ lines: [{ description: "x", quantity: 2, ratePaise: 1_000_000_000 }] }).success).toBe(false);
  });

  it("takes a quantity of 1 to 999 and a rate of at least 1 paise", () => {
    const parsed = (quantity: number, ratePaise: number) =>
      createInvoiceInput.safeParse(invoice({ lines: [{ description: "x", quantity, ratePaise }] })).success;
    expect([parsed(1, 1), parsed(999, 100), parsed(0, 100), parsed(1000, 100), parsed(1.5, 100), parsed(1, 0)]).toEqual(
      [true, true, false, false, false, false],
    );
  });

  it("answers two cancels at once with one cancel and one ALREADY_CANCELLED", async () => {
    const made = await create(services, staff, invoice());
    const results = await Promise.allSettled([
      cancelInvoice(services, staff, { invoiceId: made.id, reason: "A" }),
      cancelInvoice(services, staff, { invoiceId: made.id, reason: "B" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const refused = results.find((result) => result.status === "rejected");
    expect(refused).toMatchObject({ reason: { reason: "ALREADY_CANCELLED" } });
  });

  it("lists newest first in pages", async () => {
    const first = await create(services, staff, invoice());
    const second = await create(services, staff, invoice());
    const page = await listInvoices(services, { limit: 1 });
    expect(page.invoices.map((summary) => summary.id)).toEqual([second.id]);
    expect(page.nextCursor).toBe(second.id);
    const next = await listInvoices(services, { limit: 1, before: page.nextCursor ?? undefined });
    expect(next.invoices.map((summary) => summary.id)).toEqual([first.id]);
  });

  it("logs billing-details changes by field name only, and each create and cancel", async () => {
    await setBillingDetails(services, staff, billing({ bankAccountNumber: "999988887777", legalName: "Logged Firm" }));
    const made = await create(services, staff, invoice());
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
    const created = log.entries.find((entry) => entry.targetId === made.id && entry.action === "invoice.created");
    expect(created?.after).toEqual({ number: made.number, kind: "proforma", totalPaise: 1_000_000 });
    const cancelled = log.entries.find((entry) => entry.targetId === made.id && entry.action === "invoice.cancelled");
    expect(cancelled?.after).toEqual({ status: "cancelled", number: made.number });
  });
  it("saves a stored PNG as the logo, with the signatory, shows it, and gives its bytes to the renderer", async () => {
    const [logoKey, signatureKey] = [imageKey("logo"), imageKey("signature")];
    const [logo, signature] = [testPng(16, 16), testPng(32, 12)];
    await test.storage.put({ key: logoKey, contentType: "image/png", body: logo });
    await test.storage.put({ key: signatureKey, contentType: "image/png", body: signature });
    const saved = await setBillingDetails(
      services,
      staff,
      billing({ logoKey, signatureKey, signatoryName: "Test Person", signatoryTitle: "Proprietor" }),
    );
    expect(await getBillingDetails(services)).toEqual(saved);
    expect((await billingImageLink(services, saved, "logo"))?.url).toContain(encodeURIComponent(logoKey));
    await create(services, staff, invoice({ billTo: { name: "A", stateCode: "08" } }));
    expect(rendered[0]).toMatchObject({
      logo: { data: logo, contentType: "image/png" },
      signature: { data: signature, contentType: "image/png" },
      signatory: { firm: "Test Firm", name: "Test Person", title: "Proprietor" },
      seller: { stateLine: "Karnataka (State code: 29)" },
      billTo: { stateLine: "Rajasthan (State code: 08)" },
    });
    // Without them the renderer is given none.
    await setBillingDetails(services, staff, billing());
    await create(services, staff, invoice());
    expect([rendered[1]?.logo, rendered[1]?.signature]).toEqual([undefined, undefined]);
    expect(rendered[1]?.signatory).toEqual({ firm: "Test Firm", name: undefined, title: undefined });
    expect(await billingImageLink(services, await getBillingDetails(services), "logo")).toBeNull();
  });

  it("refuses a 2 MB image, a PDF renamed .png, a missing object, a key under another prefix or kind", async () => {
    const put = (key: string, body: Uint8Array) => test.storage.put({ key, contentType: "image/png", body });
    const [big, renamed, wrongKind, lying] = [
      imageKey("logo"),
      imageKey("logo"),
      imageKey("signature"),
      imageKey("logo", "jpg"),
    ];
    const otherPrefix = `organizations/${randomUUID()}/logo-${randomUUID()}.png`;
    await put(big, new Uint8Array(2 * 1_048_576));
    await put(renamed, new TextEncoder().encode("%PDF-1.4 a renamed document"));
    await put(wrongKind, testPng(8, 8));
    await put(otherPrefix, testPng(8, 8));
    // A PNG under a .jpg key: the type is what the key says.
    await put(lying, testPng(8, 8));
    for (const logoKey of [big, renamed, imageKey("logo"), otherPrefix, wrongKind, lying]) {
      await expect(setBillingDetails(services, staff, billing({ logoKey }))).rejects.toMatchObject({
        reason: "BILLING_IMAGE_INVALID",
      });
    }
  });

  it("gives an upload link under the platform's prefix, and takes at most 1 MB of PNG or JPEG", async () => {
    const link = await billingImageUploadLink(services, {
      kind: "signature",
      contentType: "image/jpeg",
      sizeBytes: 5000,
    });
    expect(link).toMatchObject({
      method: "PUT",
      key: expect.stringMatching(/^platform\/billing\/signature-[0-9a-f-]{36}\.jpg$/) as string,
    });
    const parsed = (input: Record<string, unknown>) => billingImageUploadLinkInput.safeParse(input).success;
    const base = { kind: "logo", contentType: "image/png" };
    expect([
      parsed({ ...base, sizeBytes: 1_048_576 }),
      parsed({ ...base, sizeBytes: 1_048_577 }),
      parsed({ ...base, contentType: "application/pdf", sizeBytes: 100 }),
    ]).toEqual([true, false, false]);
  });

  it("deletes an image the details no longer name, and keeps one they still do", async () => {
    const [first, second, signatureKey] = [imageKey("logo"), imageKey("logo"), imageKey("signature")];
    for (const key of [first, second, signatureKey]) {
      await test.storage.put({ key, contentType: "image/png", body: testPng(8, 8) });
    }
    await setBillingDetails(services, staff, billing({ logoKey: first, signatureKey }));
    await setBillingDetails(services, staff, billing({ logoKey: second, signatureKey }));
    expect(await test.storage.head(first)).toBeNull();
    await setBillingDetails(services, staff, billing({ logoKey: null, signatureKey }));
    expect([await test.storage.head(second), (await getBillingDetails(services))?.logoKey]).toEqual([null, null]);
    expect(await test.storage.head(signatureKey)).not.toBeNull();
  });

  it("makes a line of 2 × ₹4,000 an amount of ₹8,000, and the totals follow", async () => {
    const made = await create(
      services,
      staff,
      invoice({
        lines: [
          { description: "Extra seats", quantity: 2, ratePaise: 400_000 },
          { description: "Setup", quantity: 1, ratePaise: 100_000 },
        ],
      }),
    );
    expect(made.lines).toEqual([
      { description: "Extra seats", quantity: 2, ratePaise: 400_000, amountPaise: 800_000 },
      { description: "Setup", quantity: 1, ratePaise: 100_000, amountPaise: 100_000 },
    ]);
    expect(made).toMatchObject({ subtotalPaise: 900_000, totalPaise: 900_000 });
    expect(rendered[0]?.rows).toEqual([
      { index: 1, description: "Extra seats", quantity: 2, rate: "₹4,000.00", amount: "₹8,000.00" },
      { index: 2, description: "Setup", quantity: 1, rate: "₹1,000.00", amount: "₹1,000.00" },
    ]);
    expect(rendered[0]?.totals.at(-1)).toMatchObject({ label: "Total", amount: "₹9,000.00" });
  });

  it("lists an old line, with no quantity, as quantity 1 at its amount, and an old seller snapshot", async () => {
    const made = await create(services, staff, invoice());
    const old = await platformClient.platformInvoice.findUniqueOrThrow({ where: { id: made.id } });
    const newFields = new Set(["logoKey", "signatureKey", "signatoryName", "signatoryTitle"]);
    const oldSeller = Object.fromEntries(
      Object.entries(old.seller as Record<string, unknown>).filter(([field]) => !newFields.has(field)),
    );
    const id = randomUUID();
    await platformClient.platformInvoice.create({
      data: {
        ...old,
        id,
        number: `OLD/${String(year)}/001`,
        sequence: 900,
        lines: [{ description: "Starter plan", amountPaise: 1_000_000 }],
        seller: oldSeller as never,
      },
    });
    const read = await getInvoice(services, id);
    expect(read.lines).toEqual([
      { description: "Starter plan", quantity: 1, ratePaise: 1_000_000, amountPaise: 1_000_000 },
    ]);
    expect(read.seller).toMatchObject({ legalName: "Test Firm", logoKey: null, signatoryName: null });
  });
});
