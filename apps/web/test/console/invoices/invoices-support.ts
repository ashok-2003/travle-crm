// Made-up billing details and invoices for the invoice screens' tests (the repository is public: no real firm, bank or client).
import type { BillingDetails, InvoiceDetail, InvoiceSummary } from "@travel-crm/contracts/platform";

export const billing: BillingDetails = {
  legalName: "Test Firm",
  address: "1 Test Road, Kochi",
  stateCode: "32",
  pan: null,
  gstin: "32AAAAA0000A1Z5",
  phone: null,
  email: null,
  bankAccountName: "Test Firm",
  bankAccountNumber: "000011112222",
  bankIfsc: "TEST0000001",
  bankNameBranch: "Test Bank, Kochi",
  upiId: "test@upi",
  defaultTerms: "Pay within 7 days.",
  proformaPrefix: "PI",
  invoicePrefix: "INV",
};

export const summary: InvoiceSummary = {
  id: "0199a000-0000-7000-8000-0000000000b1",
  kind: "invoice",
  number: "INV/2026-27/001",
  issuedOn: "2026-11-26",
  billToName: "Acme Holidays",
  totalPaise: 1_180_000,
  status: "issued",
  createdAt: "2026-11-26T05:00:00.000Z",
};

export const cancelled: InvoiceSummary = {
  ...summary,
  id: "0199a000-0000-7000-8000-0000000000b2",
  kind: "proforma",
  number: "PI/2026-27/001",
  billToName: "Beta Tours",
  totalPaise: 1_000_000,
  status: "cancelled",
};

export const detail: InvoiceDetail = {
  ...summary,
  financialYear: "2026-27",
  sequence: 1,
  dueOn: "2026-12-03",
  billToAddress: "2 Sample Street, Pune",
  billToStateCode: "27",
  billToGstin: null,
  lines: [{ description: "Starter plan, 3 months", amountPaise: 1_000_000 }],
  gstRateBasisPoints: 1800,
  subtotalPaise: 1_000_000,
  cgstPaise: 0,
  sgstPaise: 0,
  igstPaise: 180_000,
  notes: "Pay within 7 days.",
  seller: billing,
  cancelledAt: null,
  cancelReason: null,
  createdBy: "0199a000-0000-7000-8000-0000000000ad",
};

export const page = (...invoices: InvoiceSummary[]) => ({ data: { invoices, nextCursor: null } });
