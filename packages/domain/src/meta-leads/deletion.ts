// Meta's data deletion callback (spec 10, 8.4): a signed_request names the Meta user who asked to delete their data from
// our app. Every Page that user connected, in whichever agency, is disconnected and its token deleted, the entry
// `meta.deleted-by-user` written, and Meta answered with a status address and a confirmation code. The leads stay: they
// belong to the agency as its customers' records, not to the Facebook user who connected the Page.
import { createHmac } from "node:crypto";
import { readSignedRequest } from "@travel-crm/integrations/meta-graph";
import { systemActor } from "../kernel/index.js";
import type { MetaDependencies } from "./dependencies.js";
import { disconnectInTransaction, unsubscribeBestEffort } from "./controls.js";
import { pageOf, toPageRow } from "./page-row.js";
import { routesOfMetaUser } from "./routes.js";

export interface DeletionAnswer {
  url: string;
  confirmation_code: string;
}

/** The confirmation code: a keyed HMAC of the user id and the request's time, so it is made again, not stored. */
export function confirmationCodeOf(appSecret: string, userId: string, issuedAt: number): string {
  return createHmac("sha256", appSecret)
    .update(`meta-deletion:${userId}:${String(issuedAt)}`)
    .digest("base64url")
    .slice(0, 32);
}

/** What the status page accepts as a code: the shape of one, since the deletion is done before we answer. */
export const wellFormedCode = (code: string) => /^[A-Za-z0-9_-]{32}$/.test(code);

/**
 * Handles one request. Null for a request that is not Meta's (bad signature, expired, malformed): nothing is done and
 * nothing stored. Otherwise the deletion is done before the answer.
 */
export async function handleDeletionRequest(
  dependencies: MetaDependencies,
  input: { signedRequest: string; appSecret: string; appUrl: string },
  now: Date,
): Promise<DeletionAnswer | null> {
  const payload = readSignedRequest(input.signedRequest, input.appSecret, now);
  if (payload === null) return null;
  const routes = await routesOfMetaUser(dependencies.db, payload.user_id);
  const counts = { pages: 0 };
  for (const route of routes) {
    const page = await dependencies.db.forOrg(route.organizationId, async (tx) => {
      const found = await tx.metaPage.findFirst({
        where: { pageId: route.metaPageId, metaUserId: payload.user_id, status: { not: "disconnected" } },
      });
      return found === null ? null : toPageRow(found);
    });
    if (page === null) continue;
    await unsubscribeBestEffort(dependencies, page);
    await dependencies.db.forOrg(route.organizationId, async (tx) => {
      const held = await pageOf(tx, page.id);
      if (held === null || held.status === "disconnected") return;
      await disconnectInTransaction(tx, systemActor(route.organizationId), held, now, "meta.deleted-by-user");
    });
    counts.pages += 1;
  }
  // The request is logged by counts alone: the Meta user's id is an identifier of a person.
  dependencies.logger.info({ pages: counts.pages }, "A Meta data deletion request was handled");
  const code = confirmationCodeOf(
    input.appSecret,
    payload.user_id,
    payload.issued_at ?? Math.floor(now.getTime() / 1000),
  );
  return { url: `${input.appUrl.replace(/\/$/, "")}/meta/deletion?code=${code}`, confirmation_code: code };
}
