// The same rule as scope.ts, written for the inbox's raw counts (sales inbox spec 6): which chats a member may see, as a SQL
// condition on `whatsapp_conversation c`. "all" sees every chat; "own" the chats of people with any live lead the member can
// see under their leads:view scope; a member with no lead scope sees none. scope.ts is the rule, this follows it.
import { sql, type Sql } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";

export function visibleChatSql(access: MemberAccess): Sql {
  const scope = access.permissions.scopeOf("inbox:view");
  if (scope === null) throw new DomainError("FORBIDDEN", "MISSING_PERMISSION", "Requires inbox:view");
  if (scope === "all") return sql`TRUE`;
  const leadScope = access.permissions.scopeOf("leads:view");
  if (leadScope === null) return sql`FALSE`;
  const owner = leadScope === "all" ? sql`TRUE` : sql`l.owner_user_id = ${access.userId}::uuid`;
  return sql`EXISTS (SELECT 1 FROM lead l WHERE l.person_id = c.person_id AND l.deleted_at IS NULL AND ${owner})`;
}
