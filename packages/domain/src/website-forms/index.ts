// Public API of the website-forms module: an agency's enquiry form, its key, the open check, the opened token, the ledger of
// what visitors sent, the limits and the text checks (website form spec, ADR 0033). L0: crm calls it, and it never calls crm.
export { assertAnswersMatchModes, assertNoLinks, assertNotBot } from "./checks.js";
export { noteFlood } from "./flood.js";
export { formKeyOf, newKeySecret, parseFormKey } from "./key.js";
export { formLimits } from "./limits.js";
export {
  findSubmission,
  formCounts,
  recentEnquiryCount,
  recordSubmission,
  type SubmissionOutcome,
  type SubmissionRow,
} from "./ledger.js";
export { assertFormOpen, assertHasOwner, formOpenState, type FormClosedReason } from "./open-state.js";
export { checkOpenedToken, formTokenKey, signOpenedToken } from "./opened-token.js";
export {
  changeWebsiteFormLink,
  readWebsiteForm,
  saveWebsiteForm,
  setWebsiteFormEnabled,
  type WebsiteFormRow,
} from "./settings.js";
