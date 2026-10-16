// Public API of the crm module: people, leads, the lead timeline and blocked contacts (spec 6, L1). It may call the
// catalog and tasks modules below it, never today above it.
export { blockLeadContact, listBlockedContacts, unblockContact } from "./blocking.js";
export { createLead } from "./create-lead.js";
export { mergeDestinations } from "./destination-merges.js";
export { findKnownContact } from "./known-contact.js";
export { getLead } from "./lead-detail.js";
export { editLeadPerson, editLeadTrip } from "./lead-edits.js";
export { recordLeadEvent, type LeadEventEntry } from "./lead-events.js";
export { countLeads, listLeads } from "./lead-list.js";
export { leadCountsQuery, leadListQuery, type LeadCountsFilter, type LeadListFilter } from "./lead-list-query.js";
export { addLeadWork } from "./lead-work.js";
export { addPerson, type PersonRow } from "./people.js";
export { moveLeadStage, reassignLead, reopenLead } from "./stage-changes.js";
export { addLeadNote, listLeadTimeline } from "./timeline.js";
