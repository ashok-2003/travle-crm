// API keys (release D, the developer panel): an agency's own systems call our REST API with one. A key names its
// organization and carries a secret whose hash alone is kept; it is shown once, can be revoked, and says when it was
// last used. Each key holds scopes: leads:read, leads:write.
import type { ApiKey, ApiKeyScope } from "@travel-crm/contracts/connectors";
import { apiKeyScope } from "@travel-crm/contracts/connectors";
import type { Database, OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { DomainError, type Actor } from "../kernel/index.js";
import { newOrganizationToken, parseOrganizationToken } from "../share-links/index.js";

/** Every key starts so, so a leaked one is easy to search for. */
const KEY_PREFIX = "tcrm_";
/** How much of a key is shown afterwards, to tell keys apart. */
const SHOWN_LENGTH = 12;
/** Last use is written at most this often, so a busy key doesn't write on every call. */
const LAST_USED_EVERY_MS = 60 * 1000;

interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

const scopesOf = (stored: readonly string[]): ApiKeyScope[] =>
  stored.flatMap((scope) => {
    const parsed = apiKeyScope.safeParse(scope);
    return parsed.success ? [parsed.data] : [];
  });

function apiKeyOf(row: KeyRow): ApiKey {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: scopesOf(row.scopes),
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revoked: row.revokedAt !== null,
  };
}

export async function listApiKeys(tx: OrgTx): Promise<ApiKey[]> {
  return (await tx.apiKey.findMany({ orderBy: { createdAt: "desc" } })).map(apiKeyOf);
}

export async function createApiKey(
  tx: OrgTx,
  actor: Actor,
  input: { name: string; scopes: readonly ApiKeyScope[] },
): Promise<{ apiKey: ApiKey; key: string }> {
  const { token, secretHash } = newOrganizationToken(actor.organizationId);
  const key = `${KEY_PREFIX}${token}`;
  const row = await tx.apiKey.create({
    data: {
      name: input.name,
      prefix: key.slice(0, SHOWN_LENGTH),
      keyHash: secretHash,
      scopes: [...new Set(input.scopes)],
      createdBy: actor.userId,
    },
  });
  await recordAudit(tx, actor, {
    action: "api-key.created",
    entityType: "api_key",
    entityId: row.id,
    after: { name: input.name, scopes: row.scopes },
  });
  return { apiKey: apiKeyOf(row), key };
}

export async function revokeApiKey(tx: OrgTx, actor: Actor, id: string): Promise<void> {
  const found = await tx.apiKey.findUnique({ where: { id } });
  if (!found) throw new DomainError("NOT_FOUND", "API_KEY_NOT_FOUND", "No such key");
  if (found.revokedAt !== null) return;
  await tx.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  await recordAudit(tx, actor, { action: "api-key.revoked", entityType: "api_key", entityId: id });
}

/** Who a key is, from an Authorization header's bearer token: its organization and scopes; null for a bad key. */
export async function authenticateApiKey(
  db: Pick<Database, "forOrg">,
  presented: string,
  now: Date = new Date(),
): Promise<{ organizationId: string; keyId: string; name: string; scopes: ApiKeyScope[] } | null> {
  if (!presented.startsWith(KEY_PREFIX)) return null;
  const parsed = parseOrganizationToken(presented.slice(KEY_PREFIX.length));
  if (parsed === null) return null;
  return db.forOrg(parsed.organizationId, async (tx) => {
    const row = await tx.apiKey.findUnique({
      where: { organizationId_keyHash: { organizationId: parsed.organizationId, keyHash: parsed.secretHash } },
    });
    if (row?.revokedAt !== null) return null;
    if (row.lastUsedAt === null || now.getTime() - row.lastUsedAt.getTime() > LAST_USED_EVERY_MS) {
      await tx.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: now } });
    }
    return { organizationId: parsed.organizationId, keyId: row.id, name: row.name, scopes: scopesOf(row.scopes) };
  });
}
