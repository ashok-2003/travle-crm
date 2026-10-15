// Records support's impersonation (spec 6.1) in the impersonated member's organization's audit log, after Better
// Auth's /admin/impersonate-user and /admin/stop-impersonating succeed. While it lasts, everything the admin does as
// the member is recorded with source "impersonation" by the request checks themselves.
import type { IdentityDatabase } from "@travel-crm/db/identity";
import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware, isAPIError } from "better-auth/api";
import { recordAudit } from "../../audit/index.js";

const STARTED = "/admin/impersonate-user";
const STOPPED = "/admin/stop-impersonating";

/** The member being impersonated and the platform admin doing it. */
interface Impersonation {
  userId: string;
  adminUserId: string;
  /** When the impersonation session lapses, if it isn't ended sooner. The start and stop entries both carry it. */
  expiresAt?: Date | undefined;
  /** The impersonation session's token, so a start that can't be recorded can end it again. */
  token?: string | undefined;
}

/** Reads userId and impersonatedBy from a Better Auth session row; null when it isn't an impersonation session. */
function impersonationOf(session: unknown): Impersonation | null {
  if (typeof session !== "object" || session === null) return null;
  const { userId, impersonatedBy, expiresAt, token } = session as {
    userId?: unknown;
    impersonatedBy?: unknown;
    expiresAt?: unknown;
    token?: unknown;
  };
  if (typeof userId !== "string" || typeof impersonatedBy !== "string") return null;
  const expires =
    expiresAt instanceof Date ? expiresAt : typeof expiresAt === "string" ? new Date(expiresAt) : undefined;
  return {
    userId,
    adminUserId: impersonatedBy,
    expiresAt: expires,
    token: typeof token === "string" ? token : undefined,
  };
}

async function recordImpersonation(
  database: IdentityDatabase,
  action: "support.impersonation-started" | "support.impersonation-stopped",
  { userId, adminUserId, expiresAt }: Impersonation,
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
      {
        action,
        entityType: "member",
        entityId: member.id,
        after: { userId, ...(expiresAt ? { expiresAt: expiresAt.toISOString() } : {}) },
      },
    ),
  );
}

/**
 * A Better Auth plugin with after hooks only. A refused call returns an APIError and is not recorded. Starting is read
 * from the new session the endpoint returns; stopping from the impersonation session the endpoint read before
 * deleting it (Better Auth keeps it on the request's context). A start that can't be recorded ends its session again.
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
            if (isAPIError(returned) || typeof returned !== "object" || returned === null) return;
            if (ctx.path === STARTED) {
              const impersonation = impersonationOf((returned as { session?: unknown }).session);
              if (!impersonation) return;
              try {
                await recordImpersonation(database, "support.impersonation-started", impersonation);
              } catch (error) {
                // An impersonation nobody can see in the log must not go ahead: end the session just created.
                if (impersonation.token) {
                  await database.client.session.deleteMany({ where: { token: impersonation.token } });
                }
                throw error;
              }
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
