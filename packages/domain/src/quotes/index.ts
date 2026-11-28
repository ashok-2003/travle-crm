// Public API of @travel-crm/domain/quotes: a lead's quotations, the money due and paid on them, their documents and the
// customer's link (step 3, P0). It sits above crm, which it calls; nothing below calls it.
export { ACCEPT_SMALL_PRINT, acceptQuoteFromLink, publicQuoteOf, type PublicQuote } from "./public-quote.js";
export { gstLabel, wholeRupeePrice, type WholeRupeePrice } from "./whole-rupees.js";
export { agreedQuote, raiseAgreedQuote } from "./agreed-quote.js";
export { assertTakesStandInPayments, moveStandInPayments } from "./placeholder-payments.js";
export { moneySummaryOf } from "./money-summary.js";
export { dueStatesOf, paymentStateOf, type DueState, type PaymentState } from "./due-states.js";
export { installmentsOf } from "./quote-rows.js";
export { addInstallment, recordPayment, removeInstallment, voidPayment } from "./payments.js";
export {
  assertQuoteDocument,
  issuePaymentReceipt,
  issueQuoteInvoice,
  issueQuotePdf,
  type DocumentContext,
} from "./quote-documents.js";
export { countsOf, seatsSoldAndHeld } from "./seat-counts.js";
export {
  createPackage,
  deletePackage,
  duplicateQuote,
  listPackages,
  quoteFromPackage,
  savePackage,
} from "./packages.js";
export {
  getPackage,
  publishGaps,
  removeTier,
  saveTier,
  setPackagePublished,
  setPackageSellable,
  tiersOf,
  updatePackage,
} from "./package-edit.js";
export { exTaxSubtotal, fromPrices, onlyRoomType, priceOn, totalFor, type SeasonPrices } from "./room-prices.js";
export { attachDraftBrochure, createGroupPackage } from "./group-package-create.js";
export { findPackage, findPackageForChange, type PackageRow } from "./package-row.js";
export {
  removePackageSeason,
  removeSeasonColumn,
  savePackageSeason,
  seasonsByPackage,
  seasonsOf,
} from "./package-seasons.js";
export { groupFromPrices } from "./group-from-price.js";
export { saveSpecialPrices } from "./special-prices.js";
export { savePriceTable } from "./price-table.js";
export { mergePackagePart } from "./package-part.js";
export { copyNoteToPackages } from "./copy-note.js";
export {
  departurePriceColumn,
  packageSellGaps,
  packagesAwaitingPayment,
  packagesOnOffer,
  sellablePackage,
  sellablePackages,
} from "./package-sell-gaps.js";
export {
  confirmPackagePhoto,
  listPackagePhotos,
  packagePhotoCount,
  removePackagePhoto,
  requestPackagePhotoUpload,
  type PackagePhotoDependencies,
} from "./package-photos.js";
export { brochuresByPackage, describeBrochure, type BrochureWords } from "./package-brochures.js";
export {
  confirmPackageFile,
  listPackageFiles,
  packageFilesByPackage,
  packageFilesIn,
  removePackageFile,
  requestPackageFileUpload,
  type PackageFileDependencies,
} from "./package-files.js";
export { groupTotal, type GroupTax, type GroupTotal } from "./group-total.js";
export { calculateFromPrice, makeQuotesFromPackage, quantityFor, tierItems } from "./package-quote.js";
export { marginOf } from "./margin.js";
export { noRateForDates, priceLine, pricedLineOn, sellingPrice } from "./rate-pricing.js";
export { quoteOwedSql, quoteSalesSql, quoteTaxSql } from "./sales-sql.js";
export { eraseQuoteParts, type QuotesErased } from "./erasure.js";
export { assertDraft, daysOf, findQuoteForChange, findQuoteInScope } from "./quote-rows.js";
export {
  createQuote,
  createQuoteFor,
  deleteQuote,
  getQuote,
  listLeadQuotes,
  listQuotes,
  newQuoteVersion,
  setQuoteStatus,
  updateQuote,
  type QuoteContext,
} from "./quotes.js";
export { quoteSettingsOf, saveQuoteSettings, verifyUpi } from "./settings.js";
export { quoteTablePageOf, type QuoteTableItem } from "./table-page.js";
export { upiPayLink } from "@travel-crm/contracts/quotes";
export { coveredInstallments, quoteMoney, TOUR_OPERATOR_SAC } from "./totals.js";

/** The record type of a quote shared by link (/p/<token>). */
export const QUOTE_RECORD_TYPE = "quote";
