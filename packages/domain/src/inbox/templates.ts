// The agency's message templates (spec 3.4, 5): picked up from the provider (those our team made in MSG91's panel and the status
// of every one), written here and sent for Meta's approval, edited and sent again when rejected, and archived. Meta's category
// wins: it is synced on every refresh. A template belongs to one number (multi-number spec section 7): it is listed, written,
// edited and refreshed on its own number. The provider is called outside any transaction.
import {
  markersOf,
  templateList,
  templateStatus,
  type CreateTemplateInput,
  type SendableTemplatesInput,
  type TemplateDraftInput,
  type TemplateList,
  type TemplateSummary,
} from "@travel-crm/contracts/inbox";
import type { Database, OrgTx } from "@travel-crm/db";
import type { WhatsAppProvider, WhatsAppTemplateSummary } from "@travel-crm/integrations/whatsapp";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { noticeKey } from "../crm/index.js";
import { DomainError, systemActor } from "../kernel/index.js";
import { notifyNeedsAttention } from "./attention.js";
import type { InboxDependencies } from "./dependencies.js";
import { connectionById, liveConnections, mainConnection, type ConnectionRow } from "./connection-row.js";
import { routesPage } from "./routes.js";
import { visibleConversations } from "./scope.js";
import { monthStartOf } from "./usage.js";

export interface TemplateDependencies {
  db: Database;
  /** Null when the MSG91 settings are not set. */
  provider: WhatsAppProvider | null;
  /** The agency's Owner, told with the author when a template is rejected. */
  firstOwner: (organizationId: string) => Promise<string | null>;
}

const refusedBy = (reason: string) =>
  new DomainError("CONFLICT", reason, "That template could not be sent for approval");
const notConnected = () =>
  new DomainError("CONFLICT", "WHATSAPP_NOT_CONNECTED", "WhatsApp is not set up for this agency");
const notFound = () => new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");

/** Whether MSG91 holds the number's templates now: not while it is being set up, a demo, or disconnected. */
const atProvider = (connection: ConnectionRow | null): connection is ConnectionRow =>
  connection !== null &&
  connection.status !== "setup" &&
  connection.status !== "disconnected" &&
  connection.mode !== "demo";

/** The named number (another agency's is not found), else the main one, if MSG91 holds its templates now. */
async function numberFor(deps: TemplateDependencies, organizationId: string, connectionId: string | undefined) {
  if (deps.provider === null) throw new DomainError("CONFLICT", "WHATSAPP_NOT_CONNECTED", "WhatsApp is not set up");
  const connection = await deps.db.forOrg(organizationId, (tx) =>
    connectionId === undefined ? mainConnection(tx) : connectionById(tx, connectionId),
  );
  if (connectionId !== undefined && connection === null) throw notFound();
  if (!atProvider(connection)) throw notConnected();
  return connection;
}

function summaryOf(row: {
  id: string;
  connectionId: string;
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
    connectionId: row.connectionId,
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

/**
 * Takes in what the provider lists for the named number, or for every live one: new templates, and each one's status,
 * category and words. An archived one stays archived. A number MSG91 would not answer for is tried after the others.
 */
export async function syncTemplates(
  deps: TemplateDependencies,
  organizationId: string,
  now: Date,
  connectionId?: string,
): Promise<{ templates: number }> {
  const numbers =
    connectionId === undefined
      ? (await deps.db.forOrg(organizationId, (tx) => liveConnections(tx))).filter(atProvider)
      : [await numberFor(deps, organizationId, connectionId)];
  if (deps.provider === null || numbers.length === 0) throw notConnected();
  const owner = await deps.firstOwner(organizationId);
  let templates = 0;
  let unread = false;
  for (const connection of numbers) {
    const read = await syncNumber(deps, organizationId, connection, owner, now);
    if (read === null) unread = true;
    else templates += read;
  }
  if (unread) throw new DomainError("CONFLICT", "WHATSAPP_UNAVAILABLE", "The templates could not be read");
  return { templates };
}

/** One number's templates as the provider lists them: how many it took in, or null when MSG91 did not answer. */
async function syncNumber(
  deps: TemplateDependencies,
  organizationId: string,
  connection: ConnectionRow,
  owner: string | null,
  now: Date,
): Promise<number | null> {
  const listed = await deps.provider?.listTemplates(connection.integratedNumber);
  if (!listed?.ok) return null;
  const usable = listed.templates.filter(
    (template): template is WhatsAppTemplateSummary & { category: "utility" | "marketing" } =>
      template.category !== "authentication",
  );
  await deps.db.forOrg(organizationId, async (tx) => {
    for (const template of usable) {
      const key = { connectionId: connection.id, name: template.name, language: template.language };
      const existing = await tx.whatsappTemplate.findFirst({
        where: key,
        select: { id: true, status: true, createdBy: true },
      });
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
        // Meta just turned it down: whoever wrote it, and the Owner, are told once.
        if (template.status === "rejected" && existing.status !== "rejected" && existing.status !== "archived") {
          await notifyNeedsAttention(tx, systemActor(organizationId), {
            recipientUserIds: [existing.createdBy, owner].filter((id): id is string => id !== null),
            title: `The WhatsApp template ${template.name} was rejected`,
            body: "Open Settings, WhatsApp to see why, and edit it to send it again.",
            sourceEventId: noticeKey(existing.id, "whatsapp.needs-attention"),
            now,
          });
        }
      }
    }
  });
  return usable.length;
}

/**
 * One number's templates, newest first: the named number (another agency's is not found), else the main one. `onlyApproved`
 * is the send dialog's list. With the number's month's marketing count against its cap.
 */
export async function listTemplates(
  tx: OrgTx,
  options: { onlyApproved: boolean; now: Date; timeZone?: string; connectionId?: string },
): Promise<TemplateList> {
  const connection =
    options.connectionId === undefined ? await mainConnection(tx) : await connectionById(tx, options.connectionId);
  if (options.connectionId !== undefined && connection === null) throw notFound();
  const rows =
    connection === null
      ? []
      : await tx.whatsappTemplate.findMany({
          where: {
            connectionId: connection.id,
            ...(options.onlyApproved ? { status: "approved" } : { status: { not: "archived" } }),
          },
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
    connectionId: connection?.id ?? null,
    items: rows.map(summaryOf),
    marketingUsed: usage?.marketing ?? 0,
    marketingCap: connection?.marketingCapMonth ?? 0,
    syncedAt: synced.length === 0 ? null : new Date(Math.max(...synced.map((at) => at.getTime()))).toISOString(),
  });
}

/**
 * The send dialog's templates (MN3): the chat's number when one is named (a chat out of the member's sight is not found),
 * else the named number, else the main one.
 */
export async function sendableTemplates(
  tx: OrgTx,
  access: MemberAccess,
  input: SendableTemplatesInput,
  now: Date,
): Promise<TemplateList> {
  let connectionId = input.connectionId;
  if (input.conversationId !== undefined) {
    const chat = await tx.whatsappConversation.findFirst({
      where: { AND: [{ id: input.conversationId }, visibleConversations(access)] },
      select: { connectionId: true },
    });
    if (chat === null) throw notFound();
    connectionId = chat.connectionId;
  }
  return listTemplates(tx, { onlyApproved: true, now, ...(connectionId === undefined ? {} : { connectionId }) });
}

/**
 * Writes a new template on the named live number, else the main one, and sends it for approval. It waits as `pending`
 * until a refresh says Meta decided.
 */
export async function createTemplate(
  deps: TemplateDependencies,
  access: MemberAccess,
  input: CreateTemplateInput,
  now: Date,
): Promise<{ templateId: string }> {
  const { draft } = input;
  const connection = await numberFor(deps, access.organizationId, input.connectionId);
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

/**
 * Edit and send again: only a template written here that Meta rejected, on its own number. The same name goes to Meta again.
 * SPIKE(S5).
 */
export async function editTemplate(
  deps: TemplateDependencies,
  access: MemberAccess,
  templateId: string,
  draft: TemplateDraftInput,
  now: Date,
): Promise<void> {
  const current = await deps.db.forOrg(access.organizationId, (tx) =>
    tx.whatsappTemplate.findUnique({
      where: { id: templateId },
      select: { connectionId: true, status: true, createdBy: true, name: true, language: true },
    }),
  );
  if (current === null) throw notFound();
  if (
    current.status !== "rejected" ||
    current.createdBy === null ||
    current.name !== draft.name ||
    current.language !== draft.language
  ) {
    throw new DomainError("CONFLICT", "TEMPLATE_NOT_EDITABLE", "Only a rejected template written here can be edited");
  }
  const connection = await numberFor(deps, access.organizationId, current.connectionId);
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

/**
 * Reads every routed number's templates, each on its own number (the worker, every half hour), so a rejection is noticed
 * without anyone pressing Refresh.
 */
export async function syncAllTemplates(dependencies: InboxDependencies, now: Date): Promise<number> {
  let done = 0;
  let after: string | undefined;
  for (;;) {
    const page = await routesPage(dependencies.db, { after, limit: 100 });
    for (const route of page) {
      try {
        await syncTemplates(
          { db: dependencies.db, provider: dependencies.provider, firstOwner: dependencies.identity.firstOwner },
          route.organizationId,
          now,
          route.connectionId,
        );
        done += 1;
      } catch (error) {
        // A number being set up, or MSG91 not answering: the next pass tries again.
        dependencies.logger.warn(
          { connectionId: route.connectionId, error: error instanceof Error ? error.name : "unknown" },
          "WhatsApp templates were not read",
        );
      }
    }
    if (page.length < 100) return done;
    after = page.at(-1)?.integratedNumber;
  }
}
