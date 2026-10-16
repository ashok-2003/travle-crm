// How many branding samples an organization may issue: each is kept for good, with its PDF in storage, so a button
// pressed over and over must not pile them up without end.
import type { OrgTx } from "@travel-crm/db";
import { DomainError } from "../kernel/index.js";
import { SAMPLE_PREFIX } from "./branded-sample.js";

/** Samples an organization may issue in any 24 hours: plenty for trying colours and logos. */
export const SAMPLES_PER_DAY = 50;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The organization's samples issued since `since`, in the transaction's organization (row-level security). */
export function samplesIssuedSince(tx: OrgTx, since: Date): Promise<number> {
  return tx.issuedDocument.count({ where: { issuedAt: { gte: since }, number: { startsWith: `${SAMPLE_PREFIX}-` } } });
}

/**
 * Refuses another sample once the organization has issued SAMPLES_PER_DAY in the last 24 hours
 * (`LIMIT_REACHED`/`SAMPLE_LIMIT_REACHED`). Two at the same moment may both pass: it stops waste, not a breach.
 */
export async function assertMayIssueSample(tx: OrgTx, now = new Date()): Promise<void> {
  if ((await samplesIssuedSince(tx, new Date(now.getTime() - DAY_MS))) >= SAMPLES_PER_DAY) {
    throw new DomainError("LIMIT_REACHED", "SAMPLE_LIMIT_REACHED", "The organization made its day's samples");
  }
}
