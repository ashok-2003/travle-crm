// The crm module's side of the Meta lead ads (spec 6.2): a Meta lead read as the row of a file and saved by the one save
// path, the webhook's change and the catch-up that makes up for a missed one. The meta-leads module (L0) holds the Pages,
// forms, ledger and routes; crm turns the leads it reads into leads.
export { agencyFactsOf, mayBringIn, type AgencyDependencies, type AgencyFacts } from "./agency-facts.js";
export { catchUpPage, type CatchUpResult } from "./catch-up.js";
export { catchUpBroughtInFormListener, checkMetaPageListener, metaCatchupHandler } from "./jobs.js";
export { skipLeadOfUnbroughtForm, type SkipDependencies } from "./new-form-notice.js";
export { processLeadgenChange, type ChangeResult, type MetaProcessDependencies } from "./process-change.js";
export { receiveMetaLead, sourceDetailOf, type MetaLeadContext, type MetaLeadOutcome } from "./receive-meta-lead.js";
export { saveFetchedLead, saveFetchedLeadIn, type SaveContext, type SavedFetchedLead } from "./save-fetched-lead.js";
export { earlierLeadsListener, matchMetaImportListener, type EarlierLeadsDependencies } from "./earlier-leads.js";
export { retryMetaLead, type RetryResult } from "./retry-meta-lead.js";
