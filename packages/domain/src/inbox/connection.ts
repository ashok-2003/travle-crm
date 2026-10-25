// An agency's WhatsApp number as the platform console manages it (spec 3.5, 8.5): recorded as Setting up, marked Connected
// once MSG91's first event for it arrived, paused, resumed and disconnected, with its two caps. Run in an organization step
// (asOrganization) as the platform admin, who is the actor. Every change publishes whatsapp.connection-changed in its own
// transaction, so the route table follows, and is audited. Chats stay when a number is disconnected.
import type { ConnectWhatsappInput, SetWhatsappCapsInput } from "@travel-crm/contracts/inbox";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { publishEvent } from "../jobs/index.js";
import { DomainError, type Actor } from "../kernel/index.js";
import { connectionById, liveConnection, type ConnectionRow } from "./connection-row.js";

const changed = (tx: OrgTx, connectionId: string) =>
  publishEvent(tx, { type: "whatsapp.connection-changed", payload: { connectionId } });

async function liveOrThrow(tx: OrgTx): Promise<ConnectionRow> {
  const connection = await liveConnection(tx);
  if (connection === null) {
    throw new DomainError("CONFLICT", "WHATSAPP_NOT_CONNECTED", "WhatsApp is not set up for this agency");
  }
  return connection;
}

/** Records the number as Setting up and starts routing its events (counted, not turned into leads). */
export async function connectNumber(tx: OrgTx, actor: Actor, input: ConnectWhatsappInput, now: Date): Promise<string> {
  if ((await liveConnection(tx)) !== null) {
    throw new DomainError("CONFLICT", "WHATSAPP_NUMBER_LIMIT", "This agency already has a WhatsApp number");
  }
  const created = await tx.whatsappConnection.create({
    data: {
      integratedNumber: input.integratedNumber,
      displayNumber: input.displayNumber,
      mode: input.mode,
      status: "setup",
      historyState: input.mode === "coexistence" ? "waiting" : "not_applicable",
      createdAt: now,
      ...(input.providerRef === undefined ? {} : { providerRef: input.providerRef }),
      ...(input.wabaId === undefined ? {} : { wabaId: input.wabaId }),
      ...(input.phoneNumberId === undefined ? {} : { phoneNumberId: input.phoneNumberId }),
      ...(input.note === undefined ? {} : { note: input.note }),
      createdBy: actor.userId,
      impersonatedBy: actor.impersonatedBy,
    },
    select: { id: true },
  });
  await recordAudit(tx, actor, {
    action: "whatsapp.recorded",
    entityType: "whatsapp_connection",
    entityId: created.id,
    after: { status: "setup", mode: input.mode },
  });
  await changed(tx, created.id);
  return created.id;
}

/** Setting up to Connected, once the number's first event has been seen (the console checks the plan first). */
export async function markConnected(tx: OrgTx, actor: Actor, now: Date): Promise<void> {
  const connection = await liveOrThrow(tx);
  if (connection.status === "connected") return;
  if (connection.status !== "setup" && connection.status !== "problem") {
    throw new DomainError("CONFLICT", "WHATSAPP_PAUSED", "Resume the number instead");
  }
  if (connection.lastEventAt === null) {
    throw new DomainError("CONFLICT", "WHATSAPP_NOT_SEEN", "No message from MSG91 has arrived for this number yet");
  }
  await tx.whatsappConnection.update({
    where: { id: connection.id },
    data: { status: "connected", connectedAt: connection.connectedAt ?? now, problemSince: null },
  });
  await recordAudit(tx, actor, {
    action: "whatsapp.connected",
    entityType: "whatsapp_connection",
    entityId: connection.id,
    before: { status: connection.status },
    after: { status: "connected" },
  });
  await changed(tx, connection.id);
}

async function moveTo(
  tx: OrgTx,
  actor: Actor,
  from: readonly ConnectionRow["status"][],
  to: "paused" | "connected",
  action: "whatsapp.paused" | "whatsapp.resumed",
  now: Date,
): Promise<void> {
  const connection = await liveOrThrow(tx);
  if (connection.status === to) return;
  if (!from.includes(connection.status)) {
    throw new DomainError("CONFLICT", "WHATSAPP_PAUSED", "The number is not in a state to change that way");
  }
  await tx.whatsappConnection.update({
    where: { id: connection.id },
    data: {
      status: to,
      problemSince: null,
      ...(to === "connected" ? { connectedAt: connection.connectedAt ?? now } : {}),
    },
  });
  await recordAudit(tx, actor, {
    action,
    entityType: "whatsapp_connection",
    entityId: connection.id,
    before: { status: connection.status },
    after: { status: to },
  });
  await changed(tx, connection.id);
}

/** Inbound stays stored; replies are not sent. */
export const pauseNumber = (tx: OrgTx, actor: Actor, now: Date) =>
  moveTo(tx, actor, ["connected", "problem"], "paused", "whatsapp.paused", now);

export const resumeNumber = (tx: OrgTx, actor: Actor, now: Date) =>
  moveTo(tx, actor, ["paused"], "connected", "whatsapp.resumed", now);

/** Stops WhatsApp for the agency: the route goes, chats stay readable and cannot be answered. */
export async function disconnectNumber(tx: OrgTx, actor: Actor, now: Date): Promise<void> {
  const connection = await liveOrThrow(tx);
  await tx.whatsappConnection.update({
    where: { id: connection.id },
    data: { status: "disconnected", disconnectedAt: now, problemSince: null },
  });
  await recordAudit(tx, actor, {
    action: "whatsapp.disconnected",
    entityType: "whatsapp_connection",
    entityId: connection.id,
    before: { status: connection.status },
    after: { status: "disconnected" },
  });
  await changed(tx, connection.id);
}

/** The marketing cap a month and the template cap a day, by a super admin. */
export async function setCaps(tx: OrgTx, actor: Actor, input: SetWhatsappCapsInput): Promise<void> {
  const connection = await liveOrThrow(tx);
  await tx.whatsappConnection.update({
    where: { id: connection.id },
    data: { marketingCapMonth: input.marketingCapMonth, templateCapDay: input.templateCapDay },
  });
  await recordAudit(tx, actor, {
    action: "whatsapp.caps-changed",
    entityType: "whatsapp_connection",
    entityId: connection.id,
    before: { marketingCapMonth: connection.marketingCapMonth, templateCapDay: connection.templateCapDay },
    after: { marketingCapMonth: input.marketingCapMonth, templateCapDay: input.templateCapDay },
  });
}

export { connectionById };
