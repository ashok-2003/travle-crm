// An agency's WhatsApp numbers as the platform console manages them (spec 3.5, 8.5; several numbers, spec 2026-11-22
// section 10): each recorded as Setting up (the agency's first live one is its main number), marked Connected once MSG91's
// first event for it arrived, paused, resumed, disconnected, renamed, made main, with its two caps. Run in an organization
// step (asOrganization) as the platform admin, who is the actor; each takes the number it works on, read under row-level
// security, so another agency's is "not found" (MN7). The plan's limit is the console's, checked under the subscription's
// lock. Status changes publish whatsapp.connection-changed in their own transaction, so the route table follows; every
// change is audited. Chats stay when a number is disconnected.
import type { ConnectWhatsappInput, SetWhatsappCapsInput } from "@travel-crm/contracts/inbox";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { publishEvent } from "../jobs/index.js";
import { DomainError, type Actor } from "../kernel/index.js";
import { connectionById, liveConnections, type ConnectionRow } from "./connection-row.js";

const changed = (tx: OrgTx, connectionId: string) =>
  publishEvent(tx, { type: "whatsapp.connection-changed", payload: { connectionId } });

/** The agency's live number by id: another agency's, a missing one and a disconnected one are all "not found". */
async function liveNumber(tx: OrgTx, connectionId: string): Promise<ConnectionRow> {
  const connection = await connectionById(tx, connectionId);
  if (connection === null || connection.status === "disconnected") {
    throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such WhatsApp number");
  }
  return connection;
}

/**
 * Records the number as Setting up and starts routing its events (counted, not turned into leads). The agency's first live
 * number is its main one (the lead's call: recorded, not connected). The console checks the plan first.
 */
export async function connectNumber(tx: OrgTx, actor: Actor, input: ConnectWhatsappInput, now: Date): Promise<string> {
  const live = await liveConnections(tx);
  if (live.some((connection) => connection.integratedNumber === input.integratedNumber)) {
    throw new DomainError("CONFLICT", "WHATSAPP_NUMBER_RECORDED", "This agency already has this number");
  }
  const main = live.length === 0;
  const created = await tx.whatsappConnection.create({
    data: {
      integratedNumber: input.integratedNumber,
      displayNumber: input.displayNumber,
      label: input.label,
      isMain: main,
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
    after: { status: "setup", mode: input.mode, label: input.label, main },
  });
  await changed(tx, created.id);
  return created.id;
}

/** Setting up to Connected, once the number's first event has been seen (the console checks the plan first). */
export async function markConnected(tx: OrgTx, actor: Actor, connectionId: string, now: Date): Promise<void> {
  const connection = await liveNumber(tx, connectionId);
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
  connectionId: string,
  move: {
    from: readonly ConnectionRow["status"][];
    to: "paused" | "connected";
    action: "whatsapp.paused" | "whatsapp.resumed";
  },
  now: Date,
): Promise<void> {
  const connection = await liveNumber(tx, connectionId);
  if (connection.status === move.to) return;
  if (!move.from.includes(connection.status)) {
    throw new DomainError("CONFLICT", "WHATSAPP_PAUSED", "The number is not in a state to change that way");
  }
  await tx.whatsappConnection.update({
    where: { id: connection.id },
    data: {
      status: move.to,
      problemSince: null,
      ...(move.to === "connected" ? { connectedAt: connection.connectedAt ?? now } : {}),
    },
  });
  await recordAudit(tx, actor, {
    action: move.action,
    entityType: "whatsapp_connection",
    entityId: connection.id,
    before: { status: connection.status },
    after: { status: move.to },
  });
  await changed(tx, connection.id);
}

/** Inbound stays stored; replies on this number are not sent. */
export const pauseNumber = (tx: OrgTx, actor: Actor, connectionId: string, now: Date) =>
  moveTo(tx, actor, connectionId, { from: ["connected", "problem"], to: "paused", action: "whatsapp.paused" }, now);

export const resumeNumber = (tx: OrgTx, actor: Actor, connectionId: string, now: Date) =>
  moveTo(tx, actor, connectionId, { from: ["paused"], to: "connected", action: "whatsapp.resumed" }, now);

/**
 * Stops WhatsApp on one number: its route goes, its chats stay readable and cannot be answered. The main flag stays on it:
 * the oldest live number is the main one from then on, by mainConnection's fallback (spec section 4).
 */
export async function disconnectNumber(tx: OrgTx, actor: Actor, connectionId: string, now: Date): Promise<void> {
  const connection = await liveNumber(tx, connectionId);
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

/** Moves the main mark to a live number, in one transaction: no other number keeps it. */
export async function setMainNumber(tx: OrgTx, actor: Actor, connectionId: string): Promise<void> {
  const connection = await liveNumber(tx, connectionId);
  // Flagged and live, it is the main number already (the index allows one such per agency).
  if (connection.isMain) return;
  await tx.whatsappConnection.updateMany({ where: { isMain: true }, data: { isMain: false } });
  await tx.whatsappConnection.update({ where: { id: connection.id }, data: { isMain: true } });
  await recordAudit(tx, actor, {
    action: "whatsapp.made-main",
    entityType: "whatsapp_connection",
    entityId: connection.id,
    before: { main: false },
    after: { main: true },
  });
}

/** A number's label, as platform staff rename it. */
export async function renameNumber(
  tx: OrgTx,
  actor: Actor,
  input: { connectionId: string; label: string },
): Promise<void> {
  const connection = await liveNumber(tx, input.connectionId);
  if (connection.label === input.label) return;
  await tx.whatsappConnection.update({ where: { id: connection.id }, data: { label: input.label } });
  await recordAudit(tx, actor, {
    action: "whatsapp.renamed",
    entityType: "whatsapp_connection",
    entityId: connection.id,
    before: { label: connection.label },
    after: { label: input.label },
  });
}

/** One number's marketing cap a month and template cap a day, by a super admin. */
export async function setCaps(tx: OrgTx, actor: Actor, input: SetWhatsappCapsInput): Promise<void> {
  const connection = await liveNumber(tx, input.connectionId);
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
