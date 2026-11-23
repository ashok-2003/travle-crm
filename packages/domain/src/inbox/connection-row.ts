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
  label: string;
  /** The stored flag: a disconnected number may keep it. Which number is main is mainConnection()'s answer. */
  isMain: boolean;
  aiAnswers: boolean;
  qualityRating: string | null;
  connectedAt: Date | null;
  lastEventAt: Date | null;
  lastInboundAt: Date | null;
  lastReportAt: Date | null;
  lastSendOkAt: Date | null;
  problemSince: Date | null;
  marketingCapMonth: number;
  templateCapDay: number;
  createdAt: Date;
}

const connectionFields = {
  id: true,
  organizationId: true,
  integratedNumber: true,
  displayNumber: true,
  mode: true,
  status: true,
  label: true,
  isMain: true,
  aiAnswers: true,
  qualityRating: true,
  connectedAt: true,
  lastEventAt: true,
  lastInboundAt: true,
  lastReportAt: true,
  lastSendOkAt: true,
  problemSince: true,
  marketingCapMonth: true,
  templateCapDay: true,
  createdAt: true,
} as const;

export function toConnectionRow(row: Omit<ConnectionRow, "status"> & { status: string }): ConnectionRow {
  return { ...row, status: whatsappConnectionStatus.parse(row.status) };
}

/** Every number the agency has had, oldest first: a handful at most, so the lookups below filter them in memory. */
async function everyNumber(tx: OrgTx): Promise<ConnectionRow[]> {
  const rows = await tx.whatsappConnection.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: connectionFields,
  });
  return rows.map(toConnectionRow);
}

const isLive = (row: ConnectionRow) => row.status !== "disconnected";

/** Live numbers, oldest first, with the main one moved to the front (see mainConnection). */
function mainFirst(live: ConnectionRow[]): ConnectionRow[] {
  const main = live.find((row) => row.isMain) ?? live.find((row) => row.status !== "setup") ?? live[0];
  return main === undefined ? [] : [main, ...live.filter((row) => row !== main)];
}

/** The agency's numbers that aren't disconnected: the main one first, then the oldest. */
export async function liveConnections(tx: OrgTx): Promise<ConnectionRow[]> {
  return mainFirst((await everyNumber(tx)).filter(isLive));
}

/** Every number the agency has had, live ones first: the inbox's labels and filter. */
export async function numbersOf(tx: OrgTx): Promise<ConnectionRow[]> {
  const all = await everyNumber(tx);
  return [...mainFirst(all.filter(isLive)), ...all.filter((row) => !isLive(row))];
}

/**
 * The live number flagged main, else the oldest live one, connected before one setting up; null with none. Nothing moves
 * the flag when the main number is disconnected: this falls back by itself (spec section 4).
 */
export async function mainConnection(tx: OrgTx): Promise<ConnectionRow | null> {
  return (await liveConnections(tx))[0] ?? null;
}

/** The agency's live connection (any status but disconnected), or null. Deleted in Task 14 (MN1): use sendFrom. */
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

/** The agency's live connection, or the refusal that there is none. Deleted in Task 14 (MN1): use sendFrom. */
export async function requireConnection(tx: OrgTx): Promise<ConnectionRow> {
  const connection = await liveConnection(tx);
  if (connection === null) {
    throw new DomainError("CONFLICT", "WHATSAPP_NOT_CONNECTED", "WhatsApp is not set up for this agency");
  }
  return connection;
}
