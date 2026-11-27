// A quote as the api sends it, for the quote screen's tests: a sent quote for one adult, changed by what a test names.
import type { QuoteDetail } from "@travel-crm/contracts/quotes";

export function aQuote(changes: Partial<QuoteDetail> = {}): QuoteDetail {
  return {
    id: "0199a000-0000-7000-8000-0000000000a1",
    leadId: "0199a000-0000-7000-8000-0000000000b1",
    customerName: "Rahul Mehta",
    title: "Manali 5 days",
    startDate: "2026-12-04",
    status: "sent",
    paymentWait: null,
    totals: {
      subtotalPaise: 5_000_000,
      taxPaise: 250_000,
      totalPaise: 5_250_000,
      paidPaise: 0,
      balancePaise: 5_250_000,
    },
    updatedAt: "2026-11-20T10:00:00.000Z",
    adults: 1,
    children: 0,
    days: [],
    items: [],
    inclusions: "",
    exclusions: "",
    notes: "",
    taxRateBasisPoints: 500,
    placeOfSupply: null,
    acceptedAt: null,
    acceptedName: null,
    customerPhone: "+919876543210",
    invoiceDocumentId: null,
    replacedById: null,
    departure: null,
    installments: [],
    payments: [],
    margin: {
      pricedLines: 0,
      totalLines: 0,
      belowMinimum: false,
      marginBasisPoints: null,
      marginPaise: null,
      perPersonPaise: null,
    },
    needsRateLines: 0,
    ...changes,
  };
}
