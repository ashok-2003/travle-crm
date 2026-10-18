// Destinations (spec 3.2, 3.6): the agency's own list. A name is found whatever its case, a merged one leads to the
// destination it was merged into (R34), and a new name is added once even when two saves race, through the live-name
// index (destination_name_live, R2). Renames and merges need settings:manage, which the api checks; two merges at once
// take their rows' locks in one order, so they can never point two destinations at each other.
import {
  destinationName,
  type Destination,
  type RenameDestinationInput,
  type SearchDestinationsInput,
} from "@travel-crm/contracts/catalog";
import { isUniqueViolation, softDeleted, sql, withDeleted, type OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { publishEvent } from "../jobs/index.js";
import { DomainError, newUuidV7, type Actor } from "../kernel/index.js";

/** How far a chain of merges is followed: merges of merges are rare, and a loop must not hang. */
const MAX_MERGE_HOPS = 10;

const notFound = () => new DomainError("NOT_FOUND", "NOT_FOUND", "No such destination");
const nameTaken = () => new DomainError("CONFLICT", "DESTINATION_NAME_TAKEN", "Another destination has that name");

/** A name as typed, trimmed with its inner spaces collapsed; one with nothing in it, or past 80, is refused. */
function tidyName(typed: string): string {
  const parsed = destinationName.safeParse(typed);
  if (!parsed.success) {
    throw new DomainError("VALIDATION", "INVALID_DESTINATION_NAME", "Name the destination in 1 to 80 characters");
  }
  return parsed.data;
}

/** The live destination with this name, ignoring case. */
async function liveNamed(tx: OrgTx, name: string): Promise<Destination | null> {
  const [found] = await tx.$queryRaw<Destination[]>`
    SELECT id, name FROM destination WHERE lower(name) = lower(${name}) AND deleted_at IS NULL`;
  return found ?? null;
}

/** The live destination an id is, or was merged into; null when it leads nowhere live. */
async function liveDestinationOf(tx: OrgTx, id: string): Promise<Destination | null> {
  let current: string | null = id;
  for (let hop = 0; current !== null && hop <= MAX_MERGE_HOPS; hop += 1) {
    const row: DestinationRow | null = await destinationRow(tx, current);
    if (row === null) return null;
    if (row.deletedAt === null) return { id: row.id, name: row.name };
    current = row.mergedIntoId;
  }
  return null;
}

interface DestinationRow extends Destination {
  deletedAt: Date | null;
  mergedIntoId: string | null;
}

/** A destination's row, deleted or not. */
function destinationRow(tx: OrgTx, id: string): Promise<DestinationRow | null> {
  return withDeleted(() =>
    tx.destination.findUnique({
      where: { id },
      select: { id: true, name: true, deletedAt: true, mergedIntoId: true },
    }),
  );
}

/**
 * The destination a typed name means: a live one of that name in any case, else the one a merged destination of that
 * name went into, else a new one. Two saves of a new name at once add it once: the second waits on the first's
 * insert and then reads it.
 */
export async function findOrAddDestination(tx: OrgTx, actor: Actor, typed: string): Promise<Destination> {
  const name = tidyName(typed);
  const live = await liveNamed(tx, name);
  if (live) return live;
  const merged = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM destination
    WHERE lower(name) = lower(${name}) AND deleted_at IS NOT NULL AND merged_into_id IS NOT NULL
    ORDER BY deleted_at DESC LIMIT 1`;
  for (const { id } of merged) {
    const target = await liveDestinationOf(tx, id);
    if (target) return target;
  }
  const [added] = await tx.$queryRaw<Destination[]>`
    INSERT INTO destination (id, name, created_by, updated_at)
    VALUES (${newUuidV7()}::uuid, ${name}, ${actor.userId}::uuid, now())
    ON CONFLICT (organization_id, lower(name)) WHERE deleted_at IS NULL DO NOTHING
    RETURNING id, name`;
  if (added === undefined) {
    const raced = await liveNamed(tx, name);
    if (raced === null) throw new Error("A destination added at the same time could not be read back");
    return raced;
  }
  await recordAudit(tx, actor, {
    action: "destination.added",
    entityType: "destination",
    entityId: added.id,
    after: { name: added.name },
  });
  await publishEvent(tx, { type: "destination.added", payload: { destinationId: added.id } });
  return added;
}

/** The destination, or the one it was merged into; null when there is none. */
export function destinationById(tx: OrgTx, id: string): Promise<Destination | null> {
  return liveDestinationOf(tx, id);
}

/** Escapes LIKE's wildcards, so "%" and "_" in a search are letters. */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

/** Live destinations alphabetically: all of them, or those whose name holds the query or nearly does (a typo). */
export function searchDestinations(tx: OrgTx, input: SearchDestinationsInput): Promise<Destination[]> {
  const query = input.query?.trim() ?? "";
  const matching = query === "" ? sql`TRUE` : sql`(name ILIKE ${likePattern(query)} OR ${query} <% name)`;
  return tx.$queryRaw<Destination[]>`
    SELECT id, name FROM destination
    WHERE deleted_at IS NULL AND ${matching}
    ORDER BY lower(name), id
    LIMIT ${input.limit}`;
}

/**
 * Renames a live destination; another live one with the name in any case refuses it, as does one renamed to it at the
 * same moment: the live-name index makes the second save wait for the first, then refuses it.
 */
export async function renameDestination(tx: OrgTx, actor: Actor, input: RenameDestinationInput): Promise<Destination> {
  const name = tidyName(input.name);
  const current = await tx.destination.findUnique({ where: { id: input.destinationId }, select: { name: true } });
  if (current === null) throw notFound();
  if (current.name === name) return { id: input.destinationId, name };
  const holder = await liveNamed(tx, name);
  if (holder !== null && holder.id !== input.destinationId) throw nameTaken();
  try {
    await tx.destination.update({ where: { id: input.destinationId }, data: { name } });
  } catch (error) {
    // Another destination took the name since the check: the transaction is spoilt, and the answer is the same.
    if (isUniqueViolation(error)) throw nameTaken();
    throw error;
  }
  await recordAudit(tx, actor, {
    action: "destination.renamed",
    entityType: "destination",
    entityId: input.destinationId,
    before: { name: current.name },
    after: { name },
  });
  await publishEvent(tx, { type: "destination.renamed", payload: { destinationId: input.destinationId } });
  return { id: input.destinationId, name };
}

/**
 * Locks both destinations, in id order (so merges of A into B and B into A at once wait for each other rather than
 * deadlock), each read after the other's change committed, and gives their names by id; null when either is missing
 * or deleted. FOR NO KEY UPDATE, not FOR UPDATE: a trip that names one of them takes KEY SHARE on it, which this lets
 * through, so a trip edit holding a lead the merge must move never deadlocks with the merge.
 */
async function lockBothLive(tx: OrgTx, ids: readonly [string, string]): Promise<Map<string, string> | null> {
  const rows = await tx.$queryRaw<{ id: string; name: string; live: boolean }[]>`
    SELECT id, name, deleted_at IS NULL AS live FROM destination
    WHERE id IN (${ids[0]}::uuid, ${ids[1]}::uuid)
    ORDER BY id
    FOR NO KEY UPDATE`;
  const live = rows.filter((row) => row.live);
  return live.length === 2 ? new Map(live.map((row) => [row.id, row.name])) : null;
}

/**
 * Merges one live destination into another: it is deleted and points at the one kept, so its name leads there. The
 * crm module's mergeDestinations calls this and moves the leads and enquiries.
 */
export async function mergeDestination(
  tx: OrgTx,
  actor: MemberAccess,
  input: { destinationId: string; intoDestinationId: string },
): Promise<void> {
  if (input.destinationId === input.intoDestinationId) {
    throw new DomainError("VALIDATION", "MERGE_INTO_ITSELF", "A destination can't be merged into itself");
  }
  const names = await lockBothLive(tx, [input.destinationId, input.intoDestinationId]);
  const merged = names?.get(input.destinationId);
  const kept = names?.get(input.intoDestinationId);
  if (merged === undefined || kept === undefined) throw notFound();
  await tx.destination.update({
    where: { id: input.destinationId },
    data: { mergedIntoId: input.intoDestinationId, ...softDeleted(actor.userId) },
  });
  await recordAudit(tx, actor, {
    action: "destination.merged",
    entityType: "destination",
    entityId: input.destinationId,
    before: { name: merged },
    after: { mergedInto: kept },
  });
  await publishEvent(tx, { type: "destination.merged", payload: input });
}

/** The names of these destinations, deleted and merged ones included, by id. */
export async function destinationNames(tx: OrgTx, ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await withDeleted(() =>
    tx.destination.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true } }),
  );
  return new Map(rows.map((row) => [row.id, row.name]));
}
