// audit.*: the organization's audit log (spec 9.5), for the audit log viewer: who did what, when, and as whom. Names
// come from the identity module (memberContacts), never from the sign-in tables, and only for the organization's own
// active members: anyone else is shown by what they were, never by a name the organization can't see.
import { auditLogPage, listAuditEntriesInput, type AuditActor, type AuditEntry } from "@travel-crm/contracts/audit";
import { listAuditEntries } from "@travel-crm/domain/audit";
import { orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

/** The member an entry names as acting, if any: support starting or stopping an impersonation acts as no member. */
function memberActing(entry: AuditEntry): string | null {
  if (entry.actorUserId === null || entry.source === "platform") return null;
  return entry.actorUserId === entry.impersonatedBy ? null : entry.actorUserId;
}

/** Who acted, as the viewer shows them: `names` holds the organization's active members among those acting. */
function actorOf(entry: AuditEntry, names: ReadonlyMap<string, string>): AuditActor {
  if (entry.actorUserId === null) return { kind: "system" };
  if (entry.source === "platform") return { kind: "platform" };
  const member = memberActing(entry);
  if (member === null) return { kind: "support" };
  const name = names.get(member) ?? null;
  return entry.source === "impersonation" ? { kind: "support-as-member", name } : { kind: "member", name };
}

export const auditRouter = router({
  /** The log newest first, a page at a time, or one record's history, with each change's actor named. */
  list: orgProcedure
    .requires("audit:view")
    .input(listAuditEntriesInput)
    .output(auditLogPage)
    .query(async ({ ctx, input }) => {
      const { organizationId } = ctx.member;
      const page = await ctx.db.forOrg(organizationId, (tx) => listAuditEntries(tx, input));
      const acting = new Set(page.entries.map(memberActing).filter((userId) => userId !== null));
      const members = await ctx.identity.memberContacts(organizationId, [...acting]);
      const names = new Map(members.map((member) => [member.userId, member.name]));
      // The output schema leaves out actorUserId and impersonatedBy: the viewer shows the actor, not their ids.
      return {
        entries: page.entries.map((entry) => ({ ...entry, actor: actorOf(entry, names) })),
        nextCursor: page.nextCursor,
      };
    }),
});
