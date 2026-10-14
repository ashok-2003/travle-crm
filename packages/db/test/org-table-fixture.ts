// The shape of an isolation fixture: how to create a row in one organization-owned table (see org-table-fixtures.ts).
import type { OrgTx } from "../src/for-org.js";

export interface OrgTableFixture {
  /** Creates one row in the table, inside db.forOrg(). */
  create: (tx: OrgTx) => Promise<unknown>;
  /**
   * The table is append-only for the api and worker: they can't delete its rows or change their organization_id
   * (they may update only columns granted to them by name, such as outbox_event.relayed_at). The isolation suite
   * then expects those statements to be refused outright, which is stronger than row-level security.
   */
  appendOnly?: boolean;
  /**
   * For a table whose organization_id the runtime role may not update (column-level grants), a column it may update:
   * the isolation suite checks another organization can't update that one, and can't move the row at all.
   */
  updatableColumn?: string;
}

export type OrgTableFixtures = Readonly<Record<string, OrgTableFixture>>;
