// The console's work on WhatsApp numbers (spec 3.5, 8.5, ADR 0035; several numbers, spec 2026-11-22 section 10): every
// agency's live numbers with this month's counts, one organization's numbers within its plan, and recording, marking
// connected, pausing, resuming, disconnecting, renaming and making main one number, its two caps, and the check with MSG91.
// Each change runs in one platform transaction: the inbox module's function in a step into the organization, as the
// platform admin, and the platform log beside the organization's own entry. Recording and Mark connected first hold the
// subscription's lock and count the agency's live numbers against its plan, so two records at once can't both take the last
// place. Super admins change; support of either level may look. The webhook block holds the only copies of the secrets the
// console shows, from the process settings.
import type {
  ConnectWhatsappInput,
  ConsoleConnection,
  ConsoleConnectionList,
  ConsoleNumber,
  ConsoleOrganizationWhatsapp,
  RenameWhatsappInput,
  SetWhatsappCapsInput,
  WhatsappNumberInput,
  WhatsappWebhookSettings,
} from "@travel-crm/contracts/inbox";
import type { OrgTx } from "@travel-crm/db";
import { asOrganization, type PlatformTx } from "@travel-crm/db/platform";
import {
  connectionById,
  connectNumber,
  disconnectNumber,
  isNumberHeldElsewhere,
  liveConnections,
  mainConnection,
  markConnected,
  monthStartOf,
  pauseNumber,
  renameNumber,
  resumeNumber,
  setCaps,
  setMainNumber,
  unroutedNumbers,
} from "../inbox/index.js";
import { DomainError, platformActor, type Actor } from "../kernel/index.js";
import { entitlementsOf, lockSubscription } from "../subscriptions/index.js";
import { recordPlatformAudit, type PlatformActor } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

/** The soft fair-use line: outbound messages a month over which the console row turns amber (8.2). Nothing is blocked. */
export const FAIR_USE_OUTBOUND_PER_MONTH = 5000;

const adminOf = (staff: PlatformActor): string => {
  if (staff.userId === null) throw new DomainError("FORBIDDEN", "MISSING_PERMISSION", "A platform admin is needed");
  return staff.userId;
};

interface OrganizationFacts {
  name: string;
  timeZone: string;
}

type ConnectionRow = Awaited<ReturnType<typeof readConnections>>[number];

/** The live connections with their organizations' names and zones, read apart: a query on an organization table may not follow the sign-in relation. */
async function readConnections(tx: PlatformTx, where: { organizationId?: string }) {
  const rows = await tx.whatsappConnection.findMany({
    where: { ...where, status: { not: "disconnected" } },
    orderBy: { createdAt: "desc" },
  });
  const organizations = await tx.organization.findMany({
    where: { id: { in: rows.map((row) => row.organizationId) } },
    select: { id: true, name: true, timeZone: true },
  });
  const facts = new Map<string, OrganizationFacts>(
    organizations.map((organization) => [organization.id, organization]),
  );
  return rows.map((row) => ({
    ...row,
    organization: facts.get(row.organizationId) ?? { name: "", timeZone: "Asia/Kolkata" },
  }));
}

async function connectionView(
  tx: PlatformTx,
  row: ConnectionRow,
  now: Date,
  main: boolean,
): Promise<ConsoleConnection> {
  const month = monthStartOf(now, row.organization.timeZone);
  const usage = await tx.whatsappUsageMonth.findFirst({
    where: { organizationId: row.organizationId, connectionId: row.id, month },
  });
  const subscription = await tx.subscription.findUnique({
    where: { organizationId: row.organizationId },
    select: { status: true },
  });
  const outbound = (usage?.replies ?? 0) + (usage?.utility ?? 0) + (usage?.marketing ?? 0);
  return {
    id: row.id,
    organizationId: row.organizationId,
    organizationName: row.organization.name,
    label: row.label,
    main,
    displayNumber: row.displayNumber,
    mode: row.mode === "coexistence" ? "coexistence" : row.mode === "demo" ? "demo" : "new_number",
    status: row.status as ConsoleConnection["status"],
    connectedAt: row.connectedAt?.toISOString() ?? null,
    lastEventAt: row.lastEventAt?.toISOString() ?? null,
    webhookSeenAt: row.lastEventAt?.toISOString() ?? null,
    messagesThisMonth: { inbound: usage?.inbound ?? 0, outbound, marketing: usage?.marketing ?? 0 },
    marketingCapMonth: row.marketingCapMonth,
    templateCapDay: row.templateCapDay,
    overFairUse: outbound >= FAIR_USE_OUTBOUND_PER_MONTH,
    cancelledButConnected: subscription?.status === "cancelled" && row.status !== "setup",
    problemSince: row.problemSince?.toISOString() ?? null,
    qualityRating: row.qualityRating,
    note: row.note,
  };
}

/** Every organization's live number, newest first, with the numbers MSG91 sent events for that nobody recorded. */
export async function listWhatsAppConnections(services: PlatformServices, now: Date): Promise<ConsoleConnectionList> {
  const items = await services.platformDb.transaction(async (tx) => {
    const rows = await readConnections(tx, {});
    // Each agency's main number, by the inbox's own rule: one step at a time, nothing beside it.
    const mains = new Set<string>();
    for (const organizationId of new Set(rows.map((row) => row.organizationId))) {
      const main = await asOrganization(tx, organizationId, mainConnection);
      if (main !== null) mains.add(main.id);
    }
    return Promise.all(rows.map((row) => connectionView(tx, row, now, mains.has(row.id))));
  });
  const unrouted = await unroutedNumbers(services.db);
  return {
    items,
    unrouted: unrouted.map((row) => ({
      integratedNumber: row.integratedNumber,
      events: row.events,
      lastSeenAt: row.lastSeenAt.toISOString(),
    })),
    configured: services.whatsapp != null,
  };
}

/** The agency's live numbers (the main one first) and its plan, read in one step into it. */
const numbersAndPlan = (tx: PlatformTx, organizationId: string, now: Date) =>
  asOrganization(tx, organizationId, async (orgTx) => ({
    live: await liveConnections(orgTx),
    entitlements: await entitlementsOf(orgTx, organizationId, now),
  }));

/**
 * One organization's WhatsApp group: its live numbers, the main one first, each with this and earlier months' counts and
 * why Mark connected is off; the live numbers against the plan's limit, and why Connect a number is off.
 */
export async function getOrganizationWhatsApp(
  services: PlatformServices,
  organizationId: string,
  now: Date,
): Promise<ConsoleOrganizationWhatsapp> {
  return services.platformDb.transaction(async (tx) => {
    const { live, entitlements } = await numbersAndPlan(tx, organizationId, now);
    const rows = await readConnections(tx, { organizationId });
    const order = live.map((connection) => connection.id);
    rows.sort((first, second) => order.indexOf(first.id) - order.indexOf(second.id));
    const allowed = entitlements?.limits.whatsappNumbers ?? 0;
    const hasInbox = entitlements?.modules.has("inbox") === true;
    const numbers: ConsoleNumber[] = [];
    for (const row of rows) {
      const connection = await connectionView(tx, row, now, row.id === order[0]);
      const usage = await tx.whatsappUsageMonth.findMany({
        where: { organizationId, connectionId: row.id },
        orderBy: { month: "desc" },
        take: 12,
      });
      const cannotConnectReason =
        connection.status === "connected"
          ? null
          : !hasInbox
            ? ("NO_INBOX_MODULE" as const)
            : rows.length > allowed
              ? ("NO_NUMBER_LIMIT" as const)
              : connection.webhookSeenAt === null
                ? ("NOT_SEEN" as const)
                : null;
      numbers.push({
        ...connection,
        usage: usage.map((month) => ({
          month: month.month.toISOString().slice(0, 7),
          inbound: month.inbound,
          replies: month.replies,
          utility: month.utility,
          marketing: month.marketing,
          failed: month.failed,
        })),
        cannotConnectReason,
      });
    }
    return {
      configured: services.whatsapp != null,
      numbers,
      limit: { used: rows.length, allowed },
      cannotAddReason: !hasInbox ? "NO_INBOX_MODULE" : rows.length >= allowed ? "LIMIT_REACHED" : null,
    };
  });
}

/**
 * Runs a change to one of the organization's numbers in one platform transaction, after the guard, and logs it on the
 * platform log by the number's id, which the change returns.
 */
async function changeNumber(
  services: PlatformServices,
  staff: PlatformActor,
  organizationId: string,
  action: string,
  change: (tx: OrgTx, now: Date) => Promise<string>,
  guard?: (tx: PlatformTx, now: Date) => Promise<void>,
): Promise<void> {
  const now = new Date();
  await services.platformDb.transaction(async (tx) => {
    if (guard) await guard(tx, now);
    const connectionId = await asOrganization(tx, organizationId, (orgTx) => change(orgTx, now));
    await recordPlatformAudit(tx, staff, {
      action,
      targetType: "whatsapp_connection",
      targetId: connectionId,
      targetOrganizationId: organizationId,
    });
  });
}

/**
 * The plan's room for a number (owner 8): the inbox module, and the agency's live numbers (setting up, connected, in
 * trouble or paused) within its limit, a trial's by its plan. `counting` is "new" for one being recorded, "this" for one
 * already live being marked connected. Read under the subscription's lock, held as the platform role, which alone writes
 * subscriptions: a second record waits for the first to commit, then counts it.
 */
function planRoom(organizationId: string, counting: "new" | "this") {
  return async (tx: PlatformTx, now: Date): Promise<void> => {
    await lockSubscription(tx, organizationId, now);
    const { live, entitlements } = await numbersAndPlan(tx, organizationId, now);
    if (entitlements?.modules.has("inbox") !== true) {
      throw new DomainError("FEATURE_LOCKED", "MODULE_NOT_ON_PLAN", "The plan does not include the inbox");
    }
    if (live.length + (counting === "new" ? 1 : 0) > entitlements.limits.whatsappNumbers) {
      throw new DomainError("LIMIT_REACHED", "WHATSAPP_NUMBER_LIMIT", "The plan has no room for another number");
    }
  };
}

/** Records a number as Setting up, while the plan has room for it. */
export async function connectWhatsApp(
  services: PlatformServices,
  staff: PlatformActor,
  input: ConnectWhatsappInput,
): Promise<void> {
  if (await isNumberHeldElsewhere(services.db, input.organizationId, input.integratedNumber)) {
    throw new DomainError("CONFLICT", "WHATSAPP_NUMBER_TAKEN", "Another agency already uses this number");
  }
  const actor = platformActor(input.organizationId, adminOf(staff));
  await changeNumber(
    services,
    staff,
    input.organizationId,
    "whatsapp.connected",
    (tx, now) => connectNumber(tx, actor, input, now),
    planRoom(input.organizationId, "new"),
  );
}

/** Setting up to Connected: needs the inbox module, and the agency's live numbers, this one counted, within the plan. */
export async function markWhatsAppConnected(
  services: PlatformServices,
  staff: PlatformActor,
  input: WhatsappNumberInput,
): Promise<void> {
  const actor = platformActor(input.organizationId, adminOf(staff));
  await changeNumber(
    services,
    staff,
    input.organizationId,
    "whatsapp.marked-connected",
    (tx, now) => markConnected(tx, actor, input.connectionId, now).then(() => input.connectionId),
    planRoom(input.organizationId, "this"),
  );
}

/** A change to one number by its id, as the platform admin, logged under `action`. */
function onNumber(action: string, change: (tx: OrgTx, actor: Actor, connectionId: string, now: Date) => Promise<void>) {
  return async (services: PlatformServices, staff: PlatformActor, input: WhatsappNumberInput): Promise<void> => {
    const actor = platformActor(input.organizationId, adminOf(staff));
    await changeNumber(services, staff, input.organizationId, action, (tx, now) =>
      change(tx, actor, input.connectionId, now).then(() => input.connectionId),
    );
  };
}

export const pauseWhatsApp = onNumber("whatsapp.paused", pauseNumber);
export const resumeWhatsApp = onNumber("whatsapp.resumed", resumeNumber);
export const disconnectWhatsApp = onNumber("whatsapp.disconnected", disconnectNumber);
export const setWhatsAppMain = onNumber("whatsapp.made-main", (tx, actor, connectionId) =>
  setMainNumber(tx, actor, connectionId),
);

export async function renameWhatsApp(
  services: PlatformServices,
  staff: PlatformActor,
  input: RenameWhatsappInput,
): Promise<void> {
  const actor = platformActor(input.organizationId, adminOf(staff));
  await changeNumber(services, staff, input.organizationId, "whatsapp.renamed", (tx) =>
    renameNumber(tx, actor, input).then(() => input.connectionId),
  );
}

export async function setWhatsAppCaps(
  services: PlatformServices,
  staff: PlatformActor,
  input: SetWhatsappCapsInput,
): Promise<void> {
  const actor = platformActor(input.organizationId, adminOf(staff));
  await changeNumber(services, staff, input.organizationId, "whatsapp.caps-changed", (tx) =>
    setCaps(tx, actor, input).then(() => input.connectionId),
  );
}

/** Asks MSG91 for one number's quality and status and keeps the rating (S8). Returns whether MSG91 answered. */
export async function checkWhatsAppWithProvider(
  services: PlatformServices,
  input: WhatsappNumberInput,
): Promise<{ answered: boolean }> {
  const provider = services.whatsapp?.provider;
  if (provider === undefined)
    throw new DomainError("CONFLICT", "WHATSAPP_UNAVAILABLE", "WhatsApp is not set up on this server");
  // Read under row-level security, so another agency's number is not found (MN7).
  const connection = await services.platformDb.transaction((tx) =>
    asOrganization(tx, input.organizationId, (orgTx) => connectionById(orgTx, input.connectionId)),
  );
  if (connection === null || connection.status === "disconnected") {
    throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such WhatsApp number");
  }
  const result = await provider.fetchNumber(connection.integratedNumber);
  if (!result.ok) return { answered: false };
  await services.platformDb.transaction((tx) =>
    tx.whatsappConnection.update({
      where: { id: connection.id, organizationId: input.organizationId },
      data: { qualityRating: result.info.qualityRating },
    }),
  );
  return { answered: true };
}

/** The block super admins paste into MSG91's panel; nothing when the settings are not set. */
export function whatsappWebhookSettings(services: PlatformServices): WhatsappWebhookSettings | null {
  const whatsapp = services.whatsapp;
  if (whatsapp == null) return null;
  return { url: whatsapp.webhookUrl, headerName: whatsapp.webhookHeaderName, headerValue: whatsapp.webhookHeaderValue };
}
