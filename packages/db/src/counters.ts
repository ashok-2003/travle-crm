// Readable document numbers (BK-2026-0042): one counter per organization, prefix and year.
import type { OrgTx } from "./for-org.js";

export interface DocumentNumberOptions {
  /** 2-5 capital letters naming the document type, e.g. "BK" for bookings, "QT" for quotes. */
  prefix: string;
  /** The year the number belongs to, in the organization's time zone (the caller decides). */
  year: number;
}

const PREFIX_PATTERN = /^[A-Z]{2,5}$/;

/**
 * Hands out the next number for a document type. Call inside db.forOrg(): the counter row is locked until the
 * transaction ends, so concurrent callers queue up and never receive the same number.
 */
export async function nextDocumentNumber(tx: OrgTx, { prefix, year }: DocumentNumberOptions): Promise<string> {
  if (!PREFIX_PATTERN.test(prefix)) {
    throw new RangeError(`Document prefix must be 2-5 capital letters, got ${JSON.stringify(prefix)}`);
  }
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new RangeError(`Document year must be a whole year between 2000 and 9999, got ${String(year)}`);
  }

  const key = `${prefix}-${String(year)}`;
  // organization_id is omitted on purpose: it defaults to the transaction's organization.
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO org_counter (key, value) VALUES (${key}, 1)
    ON CONFLICT (organization_id, key) DO UPDATE SET value = org_counter.value + 1
    RETURNING value`;

  const value = rows[0]?.value;
  if (value === undefined) {
    throw new Error(`Counter ${key} returned no value`);
  }
  return `${key}-${String(value).padStart(4, "0")}`;
}
