// Public API of @travel-crm/domain/sales: sales execution (the owner's focus of 2026-10-27): what makes a lead hot (a
// quote opened again, a buying word) and the hot leads to call now. It sits above crm, inbox and quotes, which it
// calls; nothing below calls it. The automatic WhatsApps (greeting, follow-ups, payment reminders) are parked.
export { hotLeadsOf, leadHeatOf } from "./hot-leads.js";
export { BUYING_WORDS, customerWroteListener, holdsBuyingWord, HOT_LEAD_KIND, quoteOpenedListener } from "./signals.js";
export { eraseSalesParts } from "./erasure.js";
