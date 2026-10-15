// Who is doing something in an organization, as every module and the audit log see it (spec 9.5).

/** Where an action came from: the web app, an API client (later), the worker, or support impersonating a user. */
export type ActorSource = "web" | "api" | "job" | "impersonation";

export interface Actor {
  readonly organizationId: string;
  /** The person acting, or null for the system: a job no person started. */
  readonly userId: string | null;
  readonly source: ActorSource;
  /** The platform admin's user id while support impersonates userId (source "impersonation"), else null. */
  readonly impersonatedBy: string | null;
}

/** The worker acting on its own, in one organization. */
export function systemActor(organizationId: string): Actor {
  return { organizationId, userId: null, source: "job", impersonatedBy: null };
}
