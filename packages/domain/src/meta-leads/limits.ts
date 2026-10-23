// Every number of the Meta lead ads is written here (spec 4.5, 8.1, 13); the ones the spec names are constants, ready to
// become plan limits or settings.
import { MAX_META_PAGES } from "@travel-crm/contracts/meta-leads";

/** How many Pages an agency may connect (Q1). */
export const maxMetaPagesPerOrganization = MAX_META_PAGES;

/** Each brought-in form's recent leads are read about every half hour per Page (M16). */
export const catchupIntervalSeconds = 1800;
/** The read starts this far before the cursor, against Meta's lead ordering and clock skew; the ledger makes it free (M16). */
export const catchupOverlapSeconds = 600;
/** Leads asked for in one list call. */
export const leadsPerReadPage = 50;
/** At most this many pages of leads are read for one form in one catch-up, so a huge backlog is spread over ticks. */
export const maxReadPagesPerForm = 20;
/** A catch-up held by the dispatcher is not queued again for this long. */
export const catchupClaimSeconds = 600;
/** The dispatcher takes this many due Pages a minute. */
export const maxCatchupsPerMinute = 50;
/** Check now is refused within this many seconds of the last check (spec 3.3). */
export const checkNowCooldownSeconds = 30;

/** A ledger row left pending is retried by the catch-up after this long (M7). */
export const pendingRetryMinutes = 5;
/** A Page's forms are read again when its page is opened after this long (M13). */
export const formsCacheSeconds = 300;
/** A token with a known expiry warns the Owner this many days before (M3). */
export const tokenWarningDays = 7;
/** A Page chosen at Facebook and never confirmed is let go after this long. */
export const draftLifetimeHours = 24;
/** A resolved problem is kept this long (spec 3.3). */
export const problemKeepDays = 7;
/** Earlier leads, the second choice at bring-in (Q3). */
export const earlierLeadDays = 30;

/** The login's state expires in this many minutes (8.4). */
export const connectStateMinutes = 10;

/** The note holds at most this many characters (M10), as every note does. */
export const maxNoteLength = 4000;

/**
 * The per-organization Graph budget (8.1): calls an hour for webhook fetches and catch-up together, of which the catch-up
 * may use half, so a burst of 200 leads does not starve a Page's token check and the webhook path borrows first.
 */
export const graphCallsPerHour = 600;
export const catchupGraphCallsPerHour = 300;
/** The app's own ceiling across all agencies (8.1): reaching it logs one line with counts. */
export const platformGraphCallsPerHour = 20_000;
