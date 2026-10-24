// The console's work on WhatsApp numbers (spec 3.5, 8.5, ADR 0035): the list of connections with this month's counts, one
// organization's connection, and recording, marking connected, pausing, resuming and disconnecting a number, its two caps, and
// the check with MSG91. Each change runs in one platform transaction: the inbox module's function in a step into the
// organization, as the platform admin, and the platform log beside the organization's own entry. Super admins change; support
// of either level may look. The webhook block holds the only copies of the secrets the console shows, from the process settings.
import type {
  ConnectWhatsappInput,
  ConsoleConnection,
  ConsoleConnectionList,
  ConsoleOrganizationWhatsapp,
  SetWhatsappCapsInput,
  WhatsappWebhookSettings,
} from "@travel-crm/contracts/inbox";
import { asOrganization, type PlatformTx } from "@travel-crm/db/platform";
import type { WhatsAppProvider } from "@travel-crm/integrations/whatsapp";
import {
  connectNumber,
  disconnectNumber,
  isNumberHeldElsewhere,
  markConnected,
  monthStartOf,
  pauseNumber,
  resumeNumber,
  setCaps,
  unroutedNumbers,
} from "../inbox/index.js";
import { DomainError, platformActor } from "../kernel/index.js";
import { entitlementsOf, lockSubscription } from "../subscriptions/index.js";
import { recordPlatformAudit, type PlatformActor } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

/** The soft fair-use line: outbound messages a month over which the console row turns amber (8.2). Nothing is blocked. */
export const FAIR_USE_OUTBOUND_PER_MONTH = 5000;

/** What the console shows of the MSG91 settings: whether they are set, the webhook block, and the provider for checks. */
export interface PlatformWhatsApp {
  provider: WhatsAppProvider;
  webhookUrl: string;
  webhookHeaderName: string;
  webhookHeaderValue: string;
}

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

async function connectionView(tx: PlatformTx, row: ConnectionRow, now: Date): Promise<ConsoleConnection> {
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

/** Every organization's number, newest first, with the numbers MSG91 sent events for that nobody recorded. */
export async function listWhatsAppConnections(services: PlatformServices, now: Date): Promise<ConsoleConnectionList> {
  const items = await services.platformDb.transaction(async (tx) => {
    const rows = await readConnections(tx, {});
    return Promise.all(rows.map((row) => connectionView(tx, row, now)));
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

/** One organization's WhatsApp group: its connection, this and earlier months' counts, and why Mark connected is off. */
export async function getOrganizationWhatsApp(
  services: PlatformServices,
  organizationId: string,
  now: Date,
): Promise<ConsoleOrganizationWhatsapp> {
  return services.platformDb.transaction(async (tx) => {
    const [row] = await readConnections(tx, { organizationId });
    const connection = row === undefined ? null : await connectionView(tx, row, now);
    const usage =
      row === undefined
        ? []
        : await tx.whatsappUsageMonth.findMany({
            where: { organizationId, connectionId: row.id },
            orderBy: { month: "desc" },
            take: 12,
          });
    const entitlements = await asOrganization(tx, organizationId, (orgTx) =>
      entitlementsOf(orgTx, organizationId, now),
    );
    const cannotConnectReason =
      connection === null || connection.status === "connected"
        ? null
        : entitlements?.modules.has("inbox") !== true
          ? ("NO_INBOX_MODULE" as const)
          : entitlements.limits.whatsappNumbers < 1
            ? ("NO_NUMBER_LIMIT" as const)
            : connection.webhookSeenAt === null
              ? ("NOT_SEEN" as const)
              : null;
    return {
      configured: services.whatsapp != null,
      connection,
      usage: usage.map((month) => ({
        month: month.month.toISOString().slice(0, 7),
        inbound: month.inbound,
        replies: month.replies,
        utility: month.utility,
        marketing: month.marketing,
        failed: month.failed,
      })),
      cannotConnectReason,
    };
  });
}

/** Runs a change to the organization's number in one platform transaction, and logs it on the platform log. */
async function changeNumber(
  services: PlatformServices,
  staff: PlatformActor,
  organizationId: string,
  action: string,
  change: (
    tx: Parameters<typeof asOrganization>[2] extends (tx: infer T) => unknown ? T : never,
    now: Date,
  ) => Promise<void>,
  guard?: (tx: PlatformTx, now: Date) => Promise<void>,
): Promise<void> {
  const now = new Date();
  await services.platformDb.transaction(async (tx) => {
    if (guard) await guard(tx, now);
    await asOrganization(tx, organizationId, (orgTx) => change(orgTx, now));
    await recordPlatformAudit(tx, staff, {
      action,
      targetType: "whatsapp_connection",
      targetId: organizationId,
      targetOrganizationId: organizationId,
    });
  });
}

/** Records the number as Setting up. */
export async function connectWhatsApp(
  services: PlatformServices,
  staff: PlatformActor,
  input: ConnectWhatsappInput,
): Promise<void> {
  if (await isNumberHeldElsewhere(services.db, input.organizationId, input.integratedNumber)) {
    throw new DomainError("CONFLICT", "WHATSAPP_NUMBER_TAKEN", "Another agency already uses this number");
  }
  const actor = platformActor(input.organizationId, adminOf(staff));
  await changeNumber(services, staff, input.organizationId, "whatsapp.connected", (tx, now) =>
    connectNumber(tx, actor, input, now).then(() => undefined),
  );
}

/** Setting up to Connected: needs the inbox module and a number on the plan, checked under the subscription's lock (8.5). */
export async function markWhatsAppConnected(
  services: PlatformServices,
  staff: PlatformActor,
  organizationId: string,
): Promise<void> {
  const actor = platformActor(organizationId, adminOf(staff));
  await changeNumber(
    services,
    staff,
    organizationId,
    "whatsapp.marked-connected",
    (tx, now) => markConnected(tx, actor, now),
    async (tx, now) => {
      // Held as the platform role, which alone writes subscriptions; the plan is then read under the lock (8.5).
      await lockSubscription(tx, organizationId, now);
      const entitlements = await asOrganization(tx, organizationId, (orgTx) =>
        entitlementsOf(orgTx, organizationId, now),
      );
      if (entitlements?.modules.has("inbox") !== true) {
        throw new DomainError("FEATURE_LOCKED", "MODULE_NOT_ON_PLAN", "The plan does not include the inbox");
      }
      if (entitlements.limits.whatsappNumbers < 1) {
        throw new DomainError("LIMIT_REACHED", "WHATSAPP_NUMBER_LIMIT", "The plan has no WhatsApp number");
      }
    },
  );
}

export async function pauseWhatsApp(
  services: PlatformServices,
  staff: PlatformActor,
  organizationId: string,
): Promise<void> {
  const actor = platformActor(organizationId, adminOf(staff));
  await changeNumber(services, staff, organizationId, "whatsapp.paused", (tx, now) => pauseNumber(tx, actor, now));
}

export async function resumeWhatsApp(
  services: PlatformServices,
  staff: PlatformActor,
  organizationId: string,
): Promise<void> {
  const actor = platformActor(organizationId, adminOf(staff));
  await changeNumber(services, staff, organizationId, "whatsapp.resumed", (tx, now) => resumeNumber(tx, actor, now));
}

export async function disconnectWhatsApp(
  services: PlatformServices,
  staff: PlatformActor,
  organizationId: string,
): Promise<void> {
  const actor = platformActor(organizationId, adminOf(staff));
  await changeNumber(services, staff, organizationId, "whatsapp.disconnected", (tx, now) =>
    disconnectNumber(tx, actor, now),
  );
}

export async function setWhatsAppCaps(
  services: PlatformServices,
  staff: PlatformActor,
  input: SetWhatsappCapsInput,
): Promise<void> {
  const actor = platformActor(input.organizationId, adminOf(staff));
  await changeNumber(services, staff, input.organizationId, "whatsapp.caps-changed", (tx) => setCaps(tx, actor, input));
}

/** Asks MSG91 for the number's quality and status and keeps the rating (S8). Returns whether MSG91 answered. */
export async function checkWhatsAppWithProvider(
  services: PlatformServices,
  organizationId: string,
): Promise<{ answered: boolean }> {
  const provider = services.whatsapp?.provider;
  if (provider === undefined)
    throw new DomainError("CONFLICT", "WHATSAPP_UNAVAILABLE", "WhatsApp is not set up on this server");
  const connection = await services.platformDb.transaction((tx) =>
    tx.whatsappConnection.findFirst({
      where: { organizationId, status: { not: "disconnected" } },
      select: { id: true, integratedNumber: true },
    }),
  );
  if (connection === null) throw new DomainError("CONFLICT", "WHATSAPP_NOT_CONNECTED", "No number is recorded");
  const result = await provider.fetchNumber(connection.integratedNumber);
  if (!result.ok) return { answered: false };
  await services.platformDb.transaction((tx) =>
    tx.whatsappConnection.update({ where: { id: connection.id }, data: { qualityRating: result.info.qualityRating } }),
  );
  return { answered: true };
}

/** The block super admins paste into MSG91's panel; nothing when the settings are not set. */
export function whatsappWebhookSettings(services: PlatformServices): WhatsappWebhookSettings | null {
  const whatsapp = services.whatsapp;
  if (whatsapp == null) return null;
  return { url: whatsapp.webhookUrl, headerName: whatsapp.webhookHeaderName, headerValue: whatsapp.webhookHeaderValue };
}
