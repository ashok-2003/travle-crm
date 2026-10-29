// Who on the team hears what (the owner, 2026-10-29): the members chosen for email get every notification that goes
// further than the bell by email too, and the members chosen for copies get every team alert (a hot lead, a booking,
// the AI asking for a person...), whoever it was for. notify() reads it; each person's own opt-outs still apply.
import type { SaveTeamRoutingInput } from "@travel-crm/contracts/notifications";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";

/** The alerts about the business that a manager may want a copy of; a person's own notices (a mention, an export) are not. */
export const TEAM_ALERT_KINDS: readonly string[] = [
  "ai.handoff",
  "ai.booking",
  "ai.payment-proof",
  "sales.hot-lead",
  "lead.slow-reply",
  "lead.unassigned",
  "lead.repeat-enquiry",
  "lead.meta-added",
  "lead.sheet-added",
  "whatsapp.past-customer",
  "whatsapp.needs-attention",
  "whatsapp.send-failed",
  "form.busy",
];

export interface TeamRoutingRow {
  emailUserIds: string[];
  copyUserIds: string[];
}

export async function teamRoutingOf(tx: OrgTx): Promise<TeamRoutingRow> {
  const row = await tx.notificationRouting.findFirst({ select: { emailUserIds: true, copyUserIds: true } });
  return row ?? { emailUserIds: [], copyUserIds: [] };
}

export async function saveTeamRouting(
  tx: OrgTx,
  access: MemberAccess,
  input: SaveTeamRoutingInput,
): Promise<TeamRoutingRow> {
  const data = {
    emailUserIds: [...new Set(input.emailUserIds)],
    copyUserIds: [...new Set(input.copyUserIds)],
    updatedBy: access.userId,
  };
  const existing = await tx.notificationRouting.findFirst({ select: { organizationId: true } });
  const select = { emailUserIds: true, copyUserIds: true } as const;
  const row =
    existing === null
      ? await tx.notificationRouting.create({ data, select })
      : await tx.notificationRouting.update({ where: { organizationId: existing.organizationId }, data, select });
  await recordAudit(tx, access, {
    action: "notifications.routing-changed",
    entityType: "notification_routing",
    entityId: access.organizationId,
    after: { emailed: row.emailUserIds.length, copied: row.copyUserIds.length },
  });
  return row;
}
