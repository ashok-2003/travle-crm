// Public API of the meta-leads module: connecting an agency's Facebook Pages, their lead forms and the questions' matches,
// the ledger of Meta leads seen, and the Page route that finds an agency from a webhook (spec 6.2, ADR 0034, L0). crm turns
// the leads it reads into enquiries; this module never calls crm or today.
export { attentionListener, enterFormNeedsAttention, enterNeedsReconnect, noticeSourceOf } from "./attention.js";
export { bringInForm, saveQuestions } from "./bring-in.js";
export { authorizeUrlOf, connectPages, finishConnect, startConnect } from "./connect.js";
export {
  disconnectInTransaction,
  disconnectPage,
  pausePage,
  requestCheckNow,
  resumePage,
  unsubscribeBestEffort,
} from "./controls.js";
export { metaServices, type MetaDependencies, type MetaLoginSettings } from "./dependencies.js";
export {
  countsByForm,
  describeForm,
  formByMetaId,
  formOfPage,
  formQuestions,
  listForms,
  questionsHashOf,
  refreshForms,
  storedMatches,
  toFormRow,
  type MetaFormRow,
} from "./forms.js";
export {
  callGraph,
  isTransient,
  lacksPermission,
  needsReconnect,
  type GraphFailure,
  type GraphLane,
  type GraphResult,
} from "./graph-calls.js";
export { leadAsRow, withoutPhonePrefix, type LeadAsRow } from "./lead-as-row.js";
export {
  claimLedger,
  isSettled,
  ledgerRowOf,
  stalePending,
  writeOutcome,
  type LedgerOutcome,
  type LedgerRow,
  type LedgerStatus,
} from "./ledger.js";
export * from "./limits.js";
export {
  findPage,
  holdPage,
  livePageByMetaId,
  pageNotFound,
  pageNotReady,
  pageOf,
  routedStatuses,
  toPageRow,
  type MetaPageRow,
} from "./page-row.js";
export { checklistOf, defaultMatches, type QuestionMatch } from "./question-fields.js";
export * as metaRefusals from "./refusals.js";
export { routeListener } from "./route-listener.js";
export {
  claimDueCatchups,
  finishCatchup,
  isHeldElsewhere,
  makeCatchupDue,
  removeRoute,
  routeCount,
  routeOfMetaPage,
  routeRowOf,
  routesOfMetaUser,
  routesPage,
  upsertRoute,
} from "./routes.js";
export { confirmationCodeOf, handleDeletionRequest, wellFormedCode, type DeletionAnswer } from "./deletion.js";
export { withdrawMetaLeads, type MetaWithdrawn } from "./erasure.js";
export { checkAllPages, META_HEALTH_QUEUE } from "./health-job.js";
export { checkPageHealth, type HealthOutcome } from "./health.js";
export { sweepMeta, type MetaSwept } from "./sweep.js";
export { clearedToken, openPageToken, sealPageToken, tokenContext } from "./tokens.js";
export { badgeOf, hideProblem, listPages, metaProblems, pageDetailOf, type MetaPageDetailFacts } from "./views.js";
