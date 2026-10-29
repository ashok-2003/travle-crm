// Public API of @travel-crm/domain/sales: sales execution (the owner's focus of 2026-10-27): the first WhatsApp to a new
// lead, follow-ups when it goes quiet, payment reminders, hot leads to call now. It sits above crm, inbox and quotes,
// which it calls; nothing below calls it.
export {
  greetNewLead,
  leadCadenceOf,
  runFollowUpsFor,
  setFollowUps,
  stopFollowUpsOnReply,
  workingMoment,
  type CadenceDependencies,
} from "./cadence.js";
export { fillParams, leadFacts, type FillContext } from "./fill-params.js";
export {
  countOpenedQuotesNoReply,
  countPaymentsDue,
  dismissOpenedQuote,
  openedQuotesNoReply,
  paymentsDue,
  type OpenedQuote,
  type PaymentDue,
} from "./today-work.js";
export { previewMessage, readyMessage } from "./message-library.js";
export { hotLeadsOf, leadHeatOf } from "./hot-leads.js";
export { PAYMENT_DUE_KIND, runRemindersFor, runSalesDueWorkFor, type ReminderDependencies } from "./reminders.js";
export { defaultSalesAutomation, salesAutomationOf, saveSalesAutomation } from "./settings.js";
export {
  customerWroteListener,
  holdsBuyingWord,
  HOT_LEAD_KIND,
  quoteOpenedListener,
  stopFollowUpsListener,
} from "./signals.js";
export { greetNewLeadListener, runSalesDueWork, SALES_DUE_WORK_QUEUE } from "./worker.js";
export { eraseSalesParts } from "./erasure.js";
