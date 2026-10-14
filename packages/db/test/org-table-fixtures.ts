// One row-creating function per organization-owned table. isolation.test.ts runs its checks on each, and fails if
// a table with an organization_id column is missing here. Add an entry whenever you add such a table.
import type { OrgTx } from "../src/for-org.js";

export const orgTableFixtures: Record<string, (tx: OrgTx) => Promise<unknown>> = {
  org_counter: (tx) => tx.orgCounter.create({ data: { key: "ISO-2000", value: 1 } }),
};

/**
 * Tables that carry organization_id but stay outside row-level security because sign-in reads them before the
 * organization is known (spec section 4). Only the identity module may touch them.
 */
export const signInTables: readonly string[] = [];
