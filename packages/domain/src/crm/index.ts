// Public API of the crm module: people, leads, the lead timeline and blocked contacts (spec 6, L1). It may call the
// catalog and tasks modules below it, never today above it.
export { mergeDestinations } from "./destination-merges.js";
export { recordLeadEvent, type LeadEventEntry } from "./lead-events.js";
