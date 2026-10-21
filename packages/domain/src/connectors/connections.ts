// Connections to other services (release D): a Facebook page whose lead ads become leads, an IndiaMART account whose
// enquiries do. Whoever manages settings connects one with its credentials, which are checked against the service,
// sealed (secret-box.ts) and kept; disconnecting stops it. Meta tells our webhook of each new lead by the page's id;
// IndiaMART is asked every ten minutes. Each lead comes in once (lead_receipt), as crm's lead from outside.
import {
  connectionProvider,
  incomingLead,
  type Connection,
  type ConnectionProvider,
  type IncomingLead,
} from "@travel-crm/contracts/connectors";
import type { Database, OrgTx } from "@travel-crm/db";
import type { IndiaMart, IndiaMartEnquiry } from "@travel-crm/integrations/indiamart";
import type { MetaGraph, MetaLead } from "@travel-crm/integrations/meta";
import { recordAudit } from "../audit/index.js";
import { DomainError, type Actor } from "../kernel/index.js";
import { takeLead, type IntakeDependencies } from "./intake.js";
import { requireBox, type SecretBox } from "./secret-box.js";

interface ConnectionRow {
  id: string;
  provider: string;
  externalId: string;
  name: string;
  status: string;
  lastSyncedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
}

function connectionOf(row: ConnectionRow): Connection {
  return {
    id: row.id,
    provider: connectionProvider.parse(row.provider),
    name: row.name,
    externalId: row.externalId,
    status:
      row.status === "connected" ? "connected" : row.status === "needs_attention" ? "needs_attention" : "disconnected",
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listConnections(tx: OrgTx, provider?: ConnectionProvider): Promise<Connection[]> {
  const rows = await tx.connection.findMany({
    where: provider === undefined ? {} : { provider },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(connectionOf);
}

async function saveConnection(
  tx: OrgTx,
  actor: Actor,
  input: { provider: ConnectionProvider; externalId: string; name: string; credentials: string; settings?: object },
): Promise<Connection> {
  const data = {
    name: input.name,
    status: "connected",
    credentials: input.credentials,
    settings: input.settings ?? {},
    lastError: null,
    createdBy: actor.userId,
  };
  const row = await tx.connection.upsert({
    where: {
      organizationId_provider_externalId: {
        organizationId: actor.organizationId,
        provider: input.provider,
        externalId: input.externalId,
      },
    },
    create: { provider: input.provider, externalId: input.externalId, ...data },
    update: data,
  });
  await recordAudit(tx, actor, {
    action: "connection.connected",
    entityType: "connection",
    entityId: row.id,
    after: { provider: input.provider, name: input.name },
  });
  return connectionOf(row);
}

export async function disconnect(tx: OrgTx, actor: Actor, id: string): Promise<void> {
  const found = await tx.connection.findUnique({ where: { id } });
  if (!found) throw new DomainError("NOT_FOUND", "CONNECTION_NOT_FOUND", "No such connection");
  await tx.connection.update({ where: { id }, data: { status: "disconnected" } });
  await recordAudit(tx, actor, {
    action: "connection.disconnected",
    entityType: "connection",
    entityId: id,
    before: { provider: found.provider, name: found.name },
  });
}

// --- Meta lead ads ---

export interface MetaDependencies {
  db: Pick<Database, "forOrg">;
  meta: MetaGraph;
  box: SecretBox | null;
}

/** Connects a Facebook page: its token is checked by reading the page, and our app subscribed to its leads. */
export async function connectMetaPage(
  dependencies: MetaDependencies,
  actor: Actor,
  input: { pageId: string; pageAccessToken: string },
): Promise<Connection> {
  const box = requireBox(dependencies.box);
  let name: string;
  try {
    name = await dependencies.meta.pageName(input.pageId, input.pageAccessToken);
    await dependencies.meta.subscribeToLeads(input.pageId, input.pageAccessToken);
  } catch {
    throw new DomainError("VALIDATION", "META_PAGE_NOT_REACHED", "Meta didn't accept this page and token");
  }
  return dependencies.db.forOrg(actor.organizationId, (tx) =>
    saveConnection(tx, actor, {
      provider: "meta_lead_ads",
      externalId: input.pageId,
      name,
      credentials: box.seal(input.pageAccessToken),
    }),
  );
}

/** The first value among a lead form's fields whose name holds one of these words. */
function fieldWith(fields: Readonly<Record<string, string>>, words: readonly string[]): string | undefined {
  const entry = Object.entries(fields).find(([name]) => words.some((word) => name.toLowerCase().includes(word)));
  const value = entry?.[1].trim();
  return value === "" ? undefined : value;
}

/** A lead ad's answer as a lead: Meta's standard fields by name, and every other answer kept in the note. */
export function leadOfMeta(lead: MetaLead): IncomingLead | null {
  const { fields } = lead;
  const first = fields.first_name ?? "";
  const last = fields.last_name ?? "";
  const name = fields.full_name ?? (`${first} ${last}`.trim() || fieldWith(fields, ["name"]));
  const known = new Set(["full_name", "first_name", "last_name", "phone_number", "email"]);
  const others = Object.entries(fields)
    .filter(([field]) => !known.has(field))
    .map(([field, value]) => `${field.replaceAll("_", " ")}: ${value}`);
  const parsed = incomingLead.safeParse({
    name,
    phone: fields.phone_number ?? fieldWith(fields, ["phone", "mobile", "whatsapp"]),
    email: fields.email ?? fieldWith(fields, ["email"]),
    destination: fieldWith(fields, ["destination", "where", "place", "trip"]),
    ...(others.length > 0 && { message: others.join("\n").slice(0, 4000) }),
    sourceDetail: (lead.campaignName ?? lead.adName ?? undefined)?.slice(0, 120),
  });
  if (parsed.success) return parsed.data;
  // A destination the agency's list wouldn't take is left in the note rather than losing the lead.
  const plain = incomingLead.safeParse({
    name,
    phone: fields.phone_number ?? fieldWith(fields, ["phone", "mobile", "whatsapp"]),
    email: fields.email ?? fieldWith(fields, ["email"]),
    ...(others.length > 0 && { message: others.join("\n").slice(0, 4000) }),
  });
  return plain.success ? plain.data : null;
}

/** Whether the service's id for this lead is new here (row-level security keeps the look to this organization). */
async function firstReceipt(tx: OrgTx, provider: string, externalId: string): Promise<boolean> {
  return (await tx.leadReceipt.findFirst({ where: { provider, externalId }, select: { id: true } })) === null;
}

/**
 * A new lead on a connected page (Meta's leadgen webhook): the page's organization, by a look across organizations
 * that returns its id alone; then the lead from Meta with the page's token, brought in once.
 */
export async function receiveMetaLead(
  dependencies: MetaDependencies & IntakeDependencies & { withoutOrg: Database["withoutOrg"] },
  notice: { pageId: string; leadgenId: string },
): Promise<void> {
  const box = requireBox(dependencies.box);
  const organizationId = await connectionOrganization(dependencies.withoutOrg, "meta_lead_ads", notice.pageId);
  if (organizationId === null) return;
  const found = await dependencies.db.forOrg(organizationId, async (tx) => {
    const connection = await tx.connection.findFirst({
      where: { provider: "meta_lead_ads", externalId: notice.pageId, status: { not: "disconnected" } },
    });
    if (connection === null || !(await firstReceipt(tx, "meta_lead_ads", notice.leadgenId))) return null;
    return connection;
  });
  if (found === null) return;
  let lead: MetaLead;
  try {
    lead = await dependencies.meta.lead(notice.leadgenId, box.open(found.credentials));
  } catch (error) {
    await markTrouble(dependencies.db, organizationId, found.id, "Meta didn't give the lead: reconnect the page");
    throw error;
  }
  const incoming = leadOfMeta(lead);
  if (incoming === null) return;
  await takeLead(
    dependencies,
    organizationId,
    incoming,
    { source: "meta_lead_ad", sourceDetail: found.name.slice(0, 120), createdAt: new Date(lead.createdTime) },
    async (tx, outcome) => {
      await tx.leadReceipt.create({
        data: { provider: "meta_lead_ads", externalId: notice.leadgenId, leadId: outcome.leadId },
      });
      await tx.connection.update({
        where: { id: found.id },
        data: { lastSyncedAt: new Date(), status: "connected", lastError: null },
      });
    },
  );
}

// --- IndiaMART ---

export interface IndiaMartDependencies extends IntakeDependencies {
  indiaMart: IndiaMart;
  box: SecretBox | null;
}

export async function connectIndiaMart(
  dependencies: Pick<IndiaMartDependencies, "db" | "box">,
  actor: Actor,
  input: { name: string; crmKey: string },
): Promise<Connection> {
  const box = requireBox(dependencies.box);
  // An IndiaMART key is checked by its first poll: IndiaMART allows one call every five minutes.
  const externalId = `crm-${input.crmKey.slice(-8)}`;
  return dependencies.db.forOrg(actor.organizationId, (tx) =>
    saveConnection(tx, actor, {
      provider: "indiamart",
      externalId,
      name: input.name,
      credentials: box.seal(input.crmKey),
    }),
  );
}

function leadOfIndiaMart(enquiry: IndiaMartEnquiry): IncomingLead | null {
  const message = [
    enquiry.product && `Product: ${enquiry.product}`,
    enquiry.city && `City: ${enquiry.city}`,
    enquiry.message,
  ]
    .filter((line): line is string => typeof line === "string" && line !== "")
    .join("\n");
  const parsed = incomingLead.safeParse({
    name: enquiry.name.slice(0, 120),
    phone: enquiry.phone ?? undefined,
    email: enquiry.email ?? undefined,
    ...(message !== "" && { message: message.slice(0, 4000) }),
    ...(enquiry.product !== null && { sourceDetail: enquiry.product.slice(0, 120) }),
  });
  return parsed.success ? parsed.data : null;
}

/** IndiaMART's first look goes back a day; later ones from a little before the last, so nothing falls between. */
const FIRST_LOOK_MS = 24 * 60 * 60 * 1000;
const OVERLAP_MS = 10 * 60 * 1000;

/** Asks IndiaMART for one connection's enquiries since its last check, and brings each new one in once. */
export async function checkIndiaMart(
  dependencies: IndiaMartDependencies,
  organizationId: string,
  connectionId: string,
  now: Date = new Date(),
): Promise<number> {
  const box = requireBox(dependencies.box);
  const connection = await dependencies.db.forOrg(organizationId, (tx) =>
    tx.connection.findUnique({ where: { id: connectionId } }),
  );
  if (connection === null || connection.status === "disconnected") return 0;
  const from = new Date((connection.lastSyncedAt?.getTime() ?? now.getTime() - FIRST_LOOK_MS) - OVERLAP_MS);
  let enquiries: IndiaMartEnquiry[];
  try {
    enquiries = await dependencies.indiaMart.enquiries(box.open(connection.credentials), from, now);
  } catch {
    await markTrouble(dependencies.db, organizationId, connectionId, "IndiaMART didn't answer: check the CRM key");
    return 0;
  }
  let added = 0;
  for (const enquiry of enquiries) {
    const isNew = await dependencies.db.forOrg(organizationId, (tx) => firstReceipt(tx, "indiamart", enquiry.id));
    const incoming = leadOfIndiaMart(enquiry);
    if (!isNew || incoming === null) continue;
    await takeLead(
      dependencies,
      organizationId,
      incoming,
      { source: "indiamart", sourceDetail: connection.name },
      async (tx, outcome) => {
        await tx.leadReceipt.create({
          data: { provider: "indiamart", externalId: enquiry.id, leadId: outcome.leadId },
        });
      },
    );
    added += 1;
  }
  await dependencies.db.forOrg(organizationId, (tx) =>
    tx.connection.update({
      where: { id: connectionId },
      data: { lastSyncedAt: now, status: "connected", lastError: null },
    }),
  );
  return added;
}

// --- Across organizations ---

/** The organization a service's own id belongs to, through the SECURITY DEFINER look that returns its id alone. */
export async function connectionOrganization(
  withoutOrg: Database["withoutOrg"],
  provider: ConnectionProvider,
  externalId: string,
): Promise<string | null> {
  const rows = await withoutOrg(
    (tx) => tx.$queryRaw<{ id: string | null }[]>`SELECT app_connection_organization(${provider}, ${externalId}) AS id`,
  );
  return rows[0]?.id ?? null;
}

/** The connections of one service a scheduled check visits: ids alone. */
export async function connectionsToCheck(
  withoutOrg: Database["withoutOrg"],
  provider: ConnectionProvider,
): Promise<{ organizationId: string; connectionId: string }[]> {
  const rows = await withoutOrg(
    (tx) =>
      tx.$queryRaw<{ organization_id: string; connection_id: string }[]>`
        SELECT organization_id, connection_id FROM app_connections_to_check(${provider})`,
  );
  return rows.map((row) => ({ organizationId: row.organization_id, connectionId: row.connection_id }));
}

async function markTrouble(
  db: Pick<Database, "forOrg">,
  organizationId: string,
  connectionId: string,
  lastError: string,
): Promise<void> {
  await db.forOrg(organizationId, (tx) =>
    tx.connection.update({ where: { id: connectionId }, data: { status: "needs_attention", lastError } }),
  );
}
