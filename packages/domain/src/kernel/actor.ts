// Who is doing something in an organization, as every module and the audit log see it (spec 9.5).

/**
 * Where an action came from: the web app, an API client (later), the worker, support impersonating a user, a
 * platform admin working in the console (onboarding, a subscription change), or a visitor to an organization's
 * public form (nobody signed in).
 */
export type ActorSource = "web" | "api" | "job" | "impersonation" | "platform" | "public";

export interface Actor {
  readonly organizationId: string;
  /** The person acting, or null for the system: a job no person started. A platform admin for source "platform". */
  readonly userId: string | null;
  readonly source: ActorSource;
  /** The platform admin's user id while support impersonates userId (source "impersonation"), else null. */
  readonly impersonatedBy: string | null;
}

/** The worker acting on its own, in one organization. */
export function systemActor(organizationId: string): Actor {
  return { organizationId, userId: null, source: "job", impersonatedBy: null };
}

/** A platform admin acting from the console in one organization, in their own name (spec 7.1). */
export function platformActor(organizationId: string, adminUserId: string): Actor {
  return { organizationId, userId: adminUserId, source: "platform", impersonatedBy: null };
}

/** A visitor to the organization's public website form: no user, never impersonated. */
export function publicActor(organizationId: string): Actor {
  return { organizationId, userId: null, source: "public", impersonatedBy: null };
}
