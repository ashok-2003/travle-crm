// Records support's impersonation (spec 6.1) in the impersonated member's organization's audit log, after Better
// Auth's /admin/impersonate-user and /admin/stop-impersonating succeed. While it lasts, everything the admin does as
// the member is recorded with source "impersonation" by the request checks themselves.
import type { IdentityDatabase } from "@travel-crm/db/identity";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { recordAudit } from "../../audit/index.js";

const STARTED = "/admin/impersonate-user";
const STOPPED = "/admin/stop-impersonating";

/** The member being impersonated and the platform admin doing it. */
interface Impersonation {
  userId: string;
  adminUserId: string;
}

/** Reads userId and impersonatedBy from a Better Auth session row; null when it isn't an impersonation session. */
function impersonationOf(session: unknown): Impersonation | null {
  if (typeof session !== "object" || session === null) return null;
  const { userId, impersonatedBy } = session as { userId?: unknown; impersonatedBy?: unknown };
  return typeof userId === "string" && typeof impersonatedBy === "string"
    ? { userId, adminUserId: impersonatedBy }
    : null;
}

async function recordImpersonation(
  database: IdentityDatabase,
  action: "support.impersonation-started" | "support.impersonation-stopped",
  { userId, adminUserId }: Impersonation,
): Promise<void> {
  // Platform staff may impersonate a user with no membership; no organization's log is theirs to write to.
  const member = await database.client.member.findUnique({ where: { userId } });
  if (!member) return;
  await database.forOrg(member.organizationId, (tx) =>
    recordAudit(
      tx,
      // The admin acts here in their own name, so they are both the actor and the impersonator.
      {
        organizationId: member.organizationId,
        userId: adminUserId,
        source: "impersonation",
        impersonatedBy: adminUserId,
      },
      { action, entityType: "member", entityId: member.id, after: { userId } },
    ),
  );
}

/**
 * A Better Auth plugin with after hooks only. A refused call returns an APIError and is not recorded. Starting is read
 * from the new session the endpoint returns; stopping from the impersonation session the endpoint read before
 * deleting it (Better Auth keeps it on the request's context).
 */
export function impersonationAudit(database: IdentityDatabase): BetterAuthPlugin {
  return {
    id: "impersonation-audit",
    hooks: {
      after: [
        {
          matcher: (context) => context.path === STARTED || context.path === STOPPED,
          handler: createAuthMiddleware(async (ctx) => {
            const returned: unknown = ctx.context.returned;
            if (returned instanceof APIError || typeof returned !== "object" || returned === null) return;
            if (ctx.path === STARTED) {
              const impersonation = impersonationOf((returned as { session?: unknown }).session);
              if (impersonation) await recordImpersonation(database, "support.impersonation-started", impersonation);
              return;
            }
            const impersonation = impersonationOf(ctx.context.session?.session);
            if (impersonation) await recordImpersonation(database, "support.impersonation-stopped", impersonation);
          }),
        },
      ],
    },
  };
}
