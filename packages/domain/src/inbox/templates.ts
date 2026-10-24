// The agency's message templates (spec 3.4, 5): picked up from the provider (those our team made in MSG91's panel and the status
// of every one), written here and sent for Meta's approval, edited and sent again when rejected, and archived. Meta's category
// wins: it is synced on every refresh. The provider is called outside any transaction.
import {
  markersOf,
  templateList,
  templateStatus,
  type TemplateDraftInput,
  type TemplateList,
  type TemplateSummary,
} from "@travel-crm/contracts/inbox";
import type { Database, OrgTx } from "@travel-crm/db";
import type { WhatsAppProvider, WhatsAppTemplateSummary } from "@travel-crm/integrations/whatsapp";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { liveConnection } from "./connection-row.js";
import { monthStartOf } from "./usage.js";

export interface TemplateDependencies {
  db: Database;
  /** Null when the MSG91 settings are not set. */
  provider: WhatsAppProvider | null;
}

const refusedBy = (reason: string) =>
  new DomainError("CONFLICT", reason, "That template could not be sent for approval");

async function connectionFor(deps: TemplateDependencies, organizationId: string) {
  if (deps.provider === null) throw new DomainError("CONFLICT", "WHATSAPP_NOT_CONNECTED", "WhatsApp is not set up");
  const connection = await deps.db.forOrg(organizationId, (tx) => liveConnection(tx));
  if (connection === null || connection.status === "setup" || connection.mode === "demo") {
    throw new DomainError("CONFLICT", "WHATSAPP_NOT_CONNECTED", "WhatsApp is not set up for this agency");
  }
  return connection;
}

function summaryOf(row: {
  id: string;
  name: string;
  language: string;
  category: string;
  body: string;
  footer: string | null;
  variables: string[];
  samples: string[];
  status: string;
  reason: string | null;
  lastUsedAt: Date | null;
  createdBy: string | null;
}): TemplateSummary {
  return {
    id: row.id,
    name: row.name,
    language: row.language,
    category: row.category === "marketing" ? "marketing" : "utility",
    body: row.body,
    footer: row.footer,
    variables: row.variables,
    samples: row.samples,
    status: templateStatus.catch("pending").parse(row.status),
    reason: row.reason,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    madeHere: row.createdBy !== null,
  };
}

/** Takes in what the provider lists: new templates, and each one's status, category and words. An archived one stays archived. */
export async function syncTemplates(
  deps: TemplateDependencies,
  organizationId: string,
  now: Date,
): Promise<{ templates: number }> {
  const connection = await connectionFor(deps, organizationId);
  const listed = await deps.provider?.listTemplates(connection.integratedNumber);
  if (!listed?.ok) {
    throw new DomainError("CONFLICT", "WHATSAPP_UNAVAILABLE", "The templates could not be read");
  }
  const usable = listed.templates.filter(
    (template): template is WhatsAppTemplateSummary & { category: "utility" | "marketing" } =>
      template.category !== "authentication",
  );
  await deps.db.forOrg(organizationId, async (tx) => {
    for (const template of usable) {
      const key = { connectionId: connection.id, name: template.name, language: template.language };
      const existing = await tx.whatsappTemplate.findFirst({ where: key, select: { id: true, status: true } });
      const data = {
        category: template.category,
        body: template.body,
        footer: template.footer,
        providerRef: template.providerRef,
        reason: template.reason,
        syncedAt: now,
      };
      if (existing === null) {
        await tx.whatsappTemplate.create({
          data: {
            ...key,
            ...data,
            status: template.status,
            variables: markersOf(template.body).map(() => "custom"),
          },
        });
      } else {
        await tx.whatsappTemplate.update({
          where: { id: existing.id },
          data: { ...data, ...(existing.status === "archived" ? {} : { status: template.status }) },
        });
      }
    }
  });
  return { templates: usable.length };
}

/** The templates, newest first; `onlyApproved` is the send dialog's list. With the month's marketing count against the cap. */
export async function listTemplates(
  tx: OrgTx,
  options: { onlyApproved: boolean; now: Date; timeZone?: string },
): Promise<TemplateList> {
  const connection = await liveConnection(tx);
  const rows = await tx.whatsappTemplate.findMany({
    where: options.onlyApproved ? { status: "approved" } : { status: { not: "archived" } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const month = monthStartOf(options.now, options.timeZone ?? "Asia/Kolkata");
  const usage =
    connection === null
      ? null
      : await tx.whatsappUsageMonth.findFirst({
          where: { connectionId: connection.id, month },
          select: { marketing: true },
        });
  const synced = rows.map((row) => row.syncedAt).filter((at): at is Date => at !== null);
  return templateList.parse({
    items: rows.map(summaryOf),
    marketingUsed: usage?.marketing ?? 0,
    marketingCap: connection?.marketingCapMonth ?? 0,
    syncedAt: synced.length === 0 ? null : new Date(Math.max(...synced.map((at) => at.getTime()))).toISOString(),
  });
}

/** Writes a new template and sends it for approval. It waits as `pending` until a refresh says Meta decided. */
export async function createTemplate(
  deps: TemplateDependencies,
  access: MemberAccess,
  draft: TemplateDraftInput,
  now: Date,
): Promise<{ templateId: string }> {
  const connection = await connectionFor(deps, access.organizationId);
  const taken = await deps.db.forOrg(access.organizationId, (tx) =>
    tx.whatsappTemplate.findFirst({
      where: { connectionId: connection.id, name: draft.name, language: draft.language },
      select: { id: true },
    }),
  );
  if (taken !== null) throw new DomainError("CONFLICT", "TEMPLATE_EXISTS", "A template has this name and language");
  const sent = await deps.provider?.createTemplate(connection.integratedNumber, {
    name: draft.name,
    language: draft.language,
    category: draft.category,
    body: draft.body,
    footer: draft.footer,
    samples: draft.samples,
  });
  if (!sent?.ok) throw refusedBy("TEMPLATE_REFUSED");
  return deps.db.forOrg(access.organizationId, async (tx) => {
    const created = await tx.whatsappTemplate.create({
      data: {
        connectionId: connection.id,
        name: draft.name,
        language: draft.language,
        category: draft.category,
        body: draft.body,
        footer: draft.footer,
        variables: draft.variables,
        samples: draft.samples,
        providerRef: sent.providerRef,
        status: "pending",
        syncedAt: now,
        createdBy: access.userId,
      },
      select: { id: true },
    });
    await recordAudit(tx, access, {
      action: "whatsapp.template-created",
      entityType: "whatsapp_template",
      entityId: created.id,
      after: { name: draft.name, category: draft.category, language: draft.language },
    });
    return { templateId: created.id };
  });
}

/** Edit and send again: only a template written here that Meta rejected. The same name goes to Meta again. SPIKE(S5). */
export async function editTemplate(
  deps: TemplateDependencies,
  access: MemberAccess,
  templateId: string,
  draft: TemplateDraftInput,
  now: Date,
): Promise<void> {
  const connection = await connectionFor(deps, access.organizationId);
  const current = await deps.db.forOrg(access.organizationId, (tx) =>
    tx.whatsappTemplate.findUnique({
      where: { id: templateId },
      select: { status: true, createdBy: true, name: true, language: true },
    }),
  );
  if (current === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  if (
    current.status !== "rejected" ||
    current.createdBy === null ||
    current.name !== draft.name ||
    current.language !== draft.language
  ) {
    throw new DomainError("CONFLICT", "TEMPLATE_NOT_EDITABLE", "Only a rejected template written here can be edited");
  }
  const sent = await deps.provider?.createTemplate(connection.integratedNumber, {
    name: draft.name,
    language: draft.language,
    category: draft.category,
    body: draft.body,
    footer: draft.footer,
    samples: draft.samples,
  });
  if (!sent?.ok) throw refusedBy("TEMPLATE_REFUSED");
  await deps.db.forOrg(access.organizationId, async (tx) => {
    await tx.whatsappTemplate.update({
      where: { id: templateId },
      data: {
        category: draft.category,
        body: draft.body,
        footer: draft.footer,
        variables: draft.variables,
        samples: draft.samples,
        providerRef: sent.providerRef,
        status: "pending",
        reason: null,
        syncedAt: now,
      },
    });
    await recordAudit(tx, access, {
      action: "whatsapp.template-edited",
      entityType: "whatsapp_template",
      entityId: templateId,
      after: { name: draft.name, category: draft.category },
    });
  });
}

/** Hides a template from the picker. It is not deleted at Meta. */
export async function archiveTemplate(tx: OrgTx, access: MemberAccess, templateId: string): Promise<void> {
  const current = await tx.whatsappTemplate.findUnique({
    where: { id: templateId },
    select: { status: true, name: true },
  });
  if (current === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  if (current.status === "archived") return;
  await tx.whatsappTemplate.update({ where: { id: templateId }, data: { status: "archived" } });
  await recordAudit(tx, access, {
    action: "whatsapp.template-archived",
    entityType: "whatsapp_template",
    entityId: templateId,
    before: { status: current.status },
    after: { status: "archived", name: current.name },
  });
}
