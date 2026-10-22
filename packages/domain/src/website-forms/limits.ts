// Every number the public form's abuse rules use, once (spec 6.3, W22, W37, W38): the rate limits, the fill time, how long a
// page's token lives, the body size, and how long the ledger is kept. The first thing to raise if a busy agency is slowed.
import type { RateLimitRule } from "../rate-limits/index.js";

export const formLimits = {
  /** form-view: key = address. A page load makes one call. */
  view: { limit: 60, windowSeconds: 60 },
  /** form-submit-agency-visitor: key = agency + address. A family retries; a bot doesn't get more. */
  submitAgencyVisitor: { limit: 3, windowSeconds: 600 },
  /** form-view-agency: key = the form. Bounds the views that have no address to count (W35). */
  viewAgency: { limit: 600, windowSeconds: 3600 },
  /** form-submit-visitor: key = address. One address spraying every agency. */
  submitVisitor: { limit: 10, windowSeconds: 3600 },
  /** form-submit-agency: key = agency. A flood can't fill an Owner's day. */
  submitAgency: { limit: 60, windowSeconds: 3600 },
  /** The share of the agency's hour that requests with no readable address may use (W35), inside submitAgency's 60. */
  submitAgencyNoAddress: { limit: 20, windowSeconds: 3600 },
  /** client-address: key = address. A diagnostic page. */
  clientAddress: { limit: 20, windowSeconds: 60 },
  /** A submission sooner than this after the page opened is refused FORM_TOO_FAST (W37). */
  minFillSeconds: 2,
  /** An opened token older than this is FORM_EXPIRED. */
  tokenMaxAgeHours: 24,
  /** Enquiries one person may have in 24 hours; the next is `duplicate` (W22). */
  perPersonPerDay: 3,
  maxBodyBytes: 16_384,
  /** Web addresses a message may hold (W38). */
  maxLinks: 2,
  /** Destinations offered on the form (W8). */
  destinationsOffered: 100,
  /** The settings page's "Last 30 days". */
  countDays: 30,
  /** The console's sweep deletes ledger rows older than this (spec 7.2). */
  ledgerKeepDays: 90,
} as const satisfies Record<string, number | RateLimitRule>;
