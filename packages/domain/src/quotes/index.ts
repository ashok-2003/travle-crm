// Public API of @travel-crm/domain/quotes: a lead's quotations, the money due and paid on them, their documents and the
// customer's link (step 3, P0). It sits above crm, which it calls; nothing below calls it.
export { acceptQuoteFromLink, publicQuoteOf, type PublicQuote } from "./public-quote.js";
export { agreedQuote } from "./agreed-quote.js";
export { moneySummaryOf } from "./money-summary.js";
export { addInstallment, recordPayment, removeInstallment, voidPayment } from "./payments.js";
export {
  assertQuoteDocument,
  issuePaymentReceipt,
  issueQuoteInvoice,
  issueQuotePdf,
  type DocumentContext,
} from "./quote-documents.js";
export { deletePackage, duplicateQuote, listPackages, quoteFromPackage, savePackage } from "./packages.js";
export { quoteOwedSql, quoteSalesSql, quoteTaxSql } from "./sales-sql.js";
export { eraseQuoteParts, type QuotesErased } from "./erasure.js";
export { assertDraft, findQuoteForChange, findQuoteInScope } from "./quote-rows.js";
export {
  createQuote,
  deleteQuote,
  getQuote,
  listLeadQuotes,
  listQuotes,
  newQuoteVersion,
  setQuoteStatus,
  updateQuote,
  type QuoteContext,
} from "./quotes.js";
export { quoteSettingsOf, saveQuoteSettings, upiPayLink } from "./settings.js";
export { coveredInstallments, quoteMoney, TOUR_OPERATOR_SAC } from "./totals.js";

/** The record type of a quote shared by link (/p/<token>). */
export const QUOTE_RECORD_TYPE = "quote";
