// The REST API's leads (release D, the developer panel): an agency's own systems read its newest leads (leads:read) or
// send one in (leads:write, through crm's one way in, as from another tool). Only public fields go out.
import type { Database } from "@travel-crm/db";
import { incomingLead, type IntakeLeadResult } from "@travel-crm/contracts/connectors";
import { takeLead, type IntakeDependencies } from "./intake.js";

export interface ApiLead {
  id: string;
  stage: string;
  source: string;
  sourceDetail: string | null;
  ownerUserId: string | null;
  createdAt: string;
  destination: string | null;
  adults: number | null;
  person: { name: string; phone: string | null; email: string | null };
}

/** The newest leads, newest first, a page at a time (before a lead's id, as the list pages). */
export async function apiListLeads(
  db: Pick<Database, "forOrg">,
  organizationId: string,
  page: { limit: number; before?: string },
): Promise<{ leads: ApiLead[]; next: string | null }> {
  const limit = Math.min(Math.max(page.limit, 1), 100);
  const rows = await db.forOrg(organizationId, (tx) =>
    tx.lead.findMany({
      where: page.before === undefined ? {} : { id: { lt: page.before } },
      orderBy: { id: "desc" },
      take: limit + 1,
      select: {
        id: true,
        stage: true,
        source: true,
        sourceDetail: true,
        ownerUserId: true,
        createdAt: true,
        adults: true,
        destination: { select: { name: true } },
        person: { select: { name: true, phoneE164: true, email: true } },
      },
    }),
  );
  const leads = rows.slice(0, limit).map((lead) => ({
    id: lead.id,
    stage: lead.stage,
    source: lead.source,
    sourceDetail: lead.sourceDetail,
    ownerUserId: lead.ownerUserId,
    createdAt: lead.createdAt.toISOString(),
    destination: lead.destination?.name ?? null,
    adults: lead.adults,
    person: { name: lead.person.name, phone: lead.person.phoneE164, email: lead.person.email },
  }));
  return { leads, next: rows.length > limit ? (leads.at(-1)?.id ?? null) : null };
}

/** A lead an agency's system sends: checked as any lead from outside, brought in as from another tool. */
export async function apiAddLead(
  dependencies: IntakeDependencies,
  organizationId: string,
  keyName: string,
  body: unknown,
): Promise<IntakeLeadResult> {
  const parsed = incomingLead.safeParse(body);
  if (!parsed.success) {
    return {
      taken: false,
      reason: "invalid",
      fields: [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "")))],
    };
  }
  const outcome = await takeLead(dependencies, organizationId, parsed.data, {
    source: "integration",
    sourceDetail: keyName.slice(0, 120),
  });
  return outcome === null ? { taken: false, reason: "not_set_up" } : { taken: true };
}
