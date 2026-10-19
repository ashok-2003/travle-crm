// What the sheets module's listeners and jobs are built from: the Google port and the hashes, the database, the files and
// spreadsheets ports (the connect-time import's file), identity's people (the connector's access afresh) and the
// subscription (may the agency still change things?).
import type { Database } from "@travel-crm/db";
import type { Spreadsheets } from "@travel-crm/integrations/spreadsheets";
import type { Files } from "../files/index.js";
import type { Identity } from "../identity/index.js";
import type { SubscriptionAccess } from "../subscriptions/index.js";
import type { SheetsDependencies } from "./dependencies.js";

export interface SheetsJobDependencies extends SheetsDependencies {
  db: Database;
  files: Files;
  spreadsheets: Spreadsheets;
  identity: Pick<Identity, "resolveAccess" | "firstOwner" | "leadWorkers" | "matchLeadWorkers" | "memberContacts">;
  subscriptions: Pick<SubscriptionAccess, "entitlementsOf">;
  /** The process's one log: ids and codes only. */
  log: (line: string) => void;
}
