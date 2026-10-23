// A connection as the inbox module reads it, and the lookups the other files share.
import type { WhatsappConnectionStatus } from "@travel-crm/contracts/inbox";
import { whatsappConnectionStatus } from "@travel-crm/contracts/inbox";
import type { OrgTx } from "@travel-crm/db";
import { DomainError } from "../kernel/index.js";

export interface ConnectionRow {
  id: string;
  organizationId: string;
  integratedNumber: string;
  displayNumber: string;
  mode: string;
  status: WhatsappConnectionStatus;
  qualityRating: string | null;
  connectedAt: Date | null;
  lastEventAt: Date | null;
  lastInboundAt: Date | null;
  lastReportAt: Date | null;
  lastSendOkAt: Date | null;
  problemSince: Date | null;
  marketingCapMonth: number;
  templateCapDay: number;
}

const connectionFields = {
  id: true,
  organizationId: true,
  integratedNumber: true,
  displayNumber: true,
  mode: true,
  status: true,
  qualityRating: true,
  connectedAt: true,
  lastEventAt: true,
  lastInboundAt: true,
  lastReportAt: true,
  lastSendOkAt: true,
  problemSince: true,
  marketingCapMonth: true,
  templateCapDay: true,
} as const;

export function toConnectionRow(row: {
  id: string;
  organizationId: string;
  integratedNumber: string;
  displayNumber: string;
  mode: string;
  status: string;
  qualityRating: string | null;
  connectedAt: Date | null;
  lastEventAt: Date | null;
  lastInboundAt: Date | null;
  lastReportAt: Date | null;
  lastSendOkAt: Date | null;
  problemSince: Date | null;
  marketingCapMonth: number;
  templateCapDay: number;
}): ConnectionRow {
  return { ...row, status: whatsappConnectionStatus.parse(row.status) };
}

/** The agency's live connection (any status but disconnected), or null. */
export async function liveConnection(tx: OrgTx): Promise<ConnectionRow | null> {
  const row = await tx.whatsappConnection.findFirst({
    where: { status: { not: "disconnected" } },
    select: connectionFields,
  });
  return row === null ? null : toConnectionRow(row);
}

/** The connection by id, or null. */
export async function connectionById(tx: OrgTx, id: string): Promise<ConnectionRow | null> {
  const row = await tx.whatsappConnection.findUnique({ where: { id }, select: connectionFields });
  return row === null ? null : toConnectionRow(row);
}

/** The agency's live connection, or the refusal that there is none. */
export async function requireConnection(tx: OrgTx): Promise<ConnectionRow> {
  const connection = await liveConnection(tx);
  if (connection === null) {
    throw new DomainError("CONFLICT", "WHATSAPP_NOT_CONNECTED", "WhatsApp is not set up for this agency");
  }
  return connection;
}
