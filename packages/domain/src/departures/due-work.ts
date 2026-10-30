// The worker's side of departures (release 7a): every ten minutes, the holds whose time has come expire, tell the lead's owner
// and free their seats for the waitlist.
import type { Database } from "@travel-crm/db";
import { forEachFullAccessAgency, type AgencyLoopDependencies } from "../subscriptions/index.js";
import { expireHolds } from "./holds.js";

/** The queue of the ten-minute look. */
export const DEPARTURE_HOLDS_QUEUE = "departures.expire-holds";

export interface DepartureJobDependencies extends AgencyLoopDependencies {
  db: Database;
}

/** Expires every agency's due holds. Returns how many. */
export async function runDepartureHoldExpiry(dependencies: DepartureJobDependencies, now: Date): Promise<number> {
  return forEachFullAccessAgency(dependencies, "The departure holds' expiry failed for an agency", (agency) =>
    dependencies.db.forOrg(agency.id, (tx) => expireHolds(tx, agency.id, now)),
  );
}
