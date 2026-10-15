// Who changes a subscription from the console: a platform admin, or the platform's own job.
import { platformActor, systemActor, type Actor } from "../kernel/index.js";

/** A platform admin by user id, or null for the platform's own jobs (the nightly demo reset). */
export interface ConsoleActor {
  readonly userId: string | null;
}

/**
 * The actor recorded in the changed organization's audit log: the admin under their own name (source "platform"),
 * or the system. Built from the organization being changed, so an entry can't land in another organization's log.
 */
export function actorIn(organizationId: string, by: ConsoleActor): Actor {
  return by.userId === null ? systemActor(organizationId) : platformActor(organizationId, by.userId);
}
