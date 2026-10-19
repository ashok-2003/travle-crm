// What the imports module's listeners are built from: the files and spreadsheets ports, identity's people and roles,
// the subscription (may the agency still change things?) and the plan's seats.
import type { Spreadsheets } from "@travel-crm/integrations/spreadsheets";
import type { Files } from "../files/index.js";
import type { Identity, SeatLimit } from "../identity/index.js";
import type { SubscriptionAccess } from "../subscriptions/index.js";

/** The parts of identity an import needs: the importer's access afresh, the lead workers and the agency's staff. */
export type ImportIdentity = Pick<Identity, "resolveAccess" | "firstOwner" | "leadWorkers" | "staff">;

export interface ImportJobDependencies {
  files: Files;
  spreadsheets: Spreadsheets;
  identity: ImportIdentity;
  subscriptions: Pick<SubscriptionAccess, "entitlementsOf">;
  seatLimit: SeatLimit;
}
