// Writes one audit entry (spec 9.5) in the caller's transaction, so the entry exists exactly when the change does.
import type { OrgTx } from "@travel-crm/db";
import type { JsonValue } from "../jobs/index.js";
import type { Actor } from "../kernel/index.js";

/** The fields of a record that changed, as plain JSON. Curated by the caller: never the whole row. */
export type AuditSnapshot = Readonly<Record<string, JsonValue>>;

/** One change to record. Leave out `before` when the record didn't exist, and `after` when it no longer does. */
export interface AuditChange {
  /** "<entity>.<what happened>", e.g. "staff.removed". */
  action: string;
  /** The kind of record, e.g. "member" or "role". */
  entityType: string;
  entityId: string;
  before?: AuditSnapshot | null;
  after?: AuditSnapshot | null;
}

/** Same pattern as event types; the audit_entry_action_format check holds it too. */
const ACTION_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;
const ENTITY_TYPE_PATTERN = /^[a-z][a-z_]{1,39}$/;
/** Each side of an entry is held to this many bytes of JSON; the database checks twice as much (jsonb's text form). */
const MAX_SNAPSHOT_BYTES = 8192;
/**
 * Words in a key that suggest a secret. The log is append-only and widely read, so a secret written there stays
 * there. Keys are split into words (camelCase, snake_case, kebab-case) and matched as whole words, so "hashtag" is fine.
 */
const SECRET_WORDS = /^(passwords?|secrets?|tokens?|hash(es)?|otp|credentials?)$/;
/** Phrases of two words, matched with the words joined, so "apiKey", "api_key" and "apikey" are all caught. */
const SECRET_PHRASES = ["apikey", "privatekey", "backupcode"];
/** Keys that contain a secret word but hold no secret. */
const ALLOWED_KEYS = new Set(["mustChangePassword"]);

/**
 * Records who changed what, from where, in the same transaction as the change. The actor's source and impersonatedBy
 * say whether it came from the web app, the worker or support impersonating a member.
 */
export async function recordAudit(tx: OrgTx, actor: Actor, change: AuditChange): Promise<void> {
  if (!ACTION_PATTERN.test(change.action)) {
    throw new RangeError(`Audit actions look like "staff.removed", got ${JSON.stringify(change.action)}`);
  }
  if (!ENTITY_TYPE_PATTERN.test(change.entityType)) {
    throw new RangeError(`Audit record kinds look like "member", got ${JSON.stringify(change.entityType)}`);
  }
  for (const [side, snapshot] of [
    ["before", change.before],
    ["after", change.after],
  ] as const) {
    if (snapshot) {
      assertNoSecrets(snapshot, side);
      if (Buffer.byteLength(JSON.stringify(snapshot)) > MAX_SNAPSHOT_BYTES) {
        throw new RangeError(`Audit snapshots hold at most ${String(MAX_SNAPSHOT_BYTES)} bytes of JSON (${side})`);
      }
    }
  }
  await tx.auditEntry.create({
    data: {
      // Named rather than defaulted: an actor of another organization then fails row-level security instead of
      // being recorded in this one.
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      source: actor.source,
      impersonatedBy: actor.impersonatedBy,
      action: change.action,
      entityType: change.entityType,
      entityId: change.entityId,
      // Left out rather than null: the column stays SQL NULL, "no state on this side".
      ...(change.before ? { before: change.before } : {}),
      ...(change.after ? { after: change.after } : {}),
    },
  });
}

function looksSecret(key: string): boolean {
  if (ALLOWED_KEYS.has(key)) return false;
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== "");
  const joined = words.join("").replace(/codes$/, "code");
  return words.some((word) => SECRET_WORDS.test(word)) || SECRET_PHRASES.some((phrase) => joined.includes(phrase));
}

function assertNoSecrets(value: JsonValue, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item: JsonValue, index) => {
      assertNoSecrets(item, `${path}.${String(index)}`);
    });
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (looksSecret(key)) {
      throw new Error(`Audit snapshots never hold secrets: remove ${childPath.slice(childPath.indexOf(".") + 1)}`);
    }
    assertNoSecrets(child, childPath);
  }
}
