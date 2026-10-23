// What the people who manage a Page can do (spec 3.3, 4.6): pause and resume, disconnect, and Check now. Pause and
// Disconnect only reduce what happens, so they are open while the agency is read-only (the procedures mark them
// lifecycle "revoke"). Disconnect keeps the forms, matches and ledger, so connecting the Page again resumes.
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { publishEvent } from "../jobs/index.js";
import { metaServices, type MetaDependencies } from "./dependencies.js";
import { callGraph } from "./graph-calls.js";
import { checkNowCooldownSeconds } from "./limits.js";
import { findPage, holdPage, pageNotFound, pageNotReady, type MetaPageRow } from "./page-row.js";
import * as refuse from "./refusals.js";
import { routeOfMetaPage } from "./routes.js";
import { clearedToken, openPageToken } from "./tokens.js";

/** The Page, held, at one of these statuses. A draft has no controls: it is not connected yet. */
async function heldAt(tx: OrgTx, pageRowId: string, statuses: readonly MetaPageRow["status"][]): Promise<MetaPageRow> {
  const page = await holdPage(tx, pageRowId);
  if (page === null || page.status === "disconnected" || page.status === "connecting") throw pageNotFound();
  if (!statuses.includes(page.status)) throw pageNotReady();
  return page;
}

/** Pause: the Page stops saving and reading, its subscription kept; leads meanwhile are found on Resume. Pausing a paused Page changes nothing. */
export async function pausePage(tx: OrgTx, access: MemberAccess, pageRowId: string): Promise<void> {
  const page = await heldAt(tx, pageRowId, ["running", "needs_reconnect", "paused"]);
  if (page.status === "paused") return;
  await tx.metaPage.update({ where: { id: page.id }, data: { status: "paused", attentionSince: null } });
  await recordAudit(tx, access, {
    action: "meta.page-paused",
    entityType: "meta_page",
    entityId: page.id,
    before: { status: page.status },
    after: { status: "paused" },
  });
  await publishEvent(tx, { type: "meta.page-changed", payload: { pageId: page.id } });
}

/** Resume: reading continues from the cursor, so the leads of the pause are found by the catch-up. */
export async function resumePage(tx: OrgTx, access: MemberAccess, pageRowId: string): Promise<void> {
  const page = await heldAt(tx, pageRowId, ["paused"]);
  await tx.metaPage.update({ where: { id: page.id }, data: { status: "running", consecutiveFailures: 0 } });
  await recordAudit(tx, access, {
    action: "meta.page-resumed",
    entityType: "meta_page",
    entityId: page.id,
    before: { status: "paused" },
    after: { status: "running" },
  });
  await publishEvent(tx, { type: "meta.page-changed", payload: { pageId: page.id } });
  await publishEvent(tx, { type: "meta.check-requested", payload: { pageId: page.id } });
}

/** Check now: a read of the Page's forms' recent leads at once. Refused within 30 seconds of the last check. */
export async function requestCheckNow(tx: OrgTx, pageRowId: string, now: Date): Promise<void> {
  const page = await heldAt(tx, pageRowId, ["running"]);
  if (page.lastCheckedAt !== null && now.getTime() - page.lastCheckedAt.getTime() < checkNowCooldownSeconds * 1000) {
    throw refuse.checkedJustNow();
  }
  await publishEvent(tx, { type: "meta.check-requested", payload: { pageId: page.id } });
}

/**
 * Disconnect Page: Meta is told to stop (best effort: if Meta fails the Page is still disconnected and the token is still
 * deleted), then the token fields are deleted and the route goes. The forms, matches and ledger stay.
 */
export async function disconnectPage(
  dependencies: MetaDependencies,
  access: MemberAccess,
  pageRowId: string,
  now: Date,
): Promise<void> {
  const { db } = dependencies;
  const page = await db.forOrg(access.organizationId, (tx) => findPage(tx, pageRowId));
  await unsubscribeBestEffort(dependencies, page);
  await db.forOrg(access.organizationId, async (tx) => {
    const held = await holdPage(tx, pageRowId);
    if (held === null || held.status === "disconnected") return;
    await disconnectInTransaction(tx, access, held, now);
  });
}

/** Tells Meta to stop sending this app the Page's leads; a failure is logged as a code and changes nothing. */
export async function unsubscribeBestEffort(dependencies: MetaDependencies, page: MetaPageRow): Promise<void> {
  const services = metaServices(dependencies);
  if (services === null) return;
  const token = openPageToken(services.secretBox, page);
  if (token === null) return;
  // The subscription is the app's for the Page, whoever connected it: only the agency that holds the Page may end it
  // (a loser of a two-connect race must not stop the winner's webhooks).
  const held = await routeOfMetaPage(dependencies.db, page.pageId);
  if (held !== null && held.organizationId !== page.organizationId) return;
  const result = await callGraph(dependencies, page.organizationId, "interactive", () =>
    services.graph.unsubscribePage(page.pageId, token),
  );
  if (!result.ok) {
    dependencies.logger.warn(
      { pageRowId: page.id, reason: result.failure.reason, code: result.failure.code },
      "Meta did not unsubscribe a Page",
    );
  }
}

/** The disconnection itself, in the caller's transaction: also the deletion callback's. */
export async function disconnectInTransaction(
  tx: OrgTx,
  actor: Parameters<typeof recordAudit>[1],
  page: MetaPageRow,
  now: Date,
  action: "meta.page-disconnected" | "meta.deleted-by-user" = "meta.page-disconnected",
): Promise<void> {
  await tx.metaPage.update({
    where: { id: page.id },
    data: { status: "disconnected", disconnectedAt: now, attentionSince: null, ...clearedToken },
  });
  await recordAudit(tx, actor, {
    action,
    entityType: "meta_page",
    entityId: page.id,
    before: { status: page.status },
    after: {
      status: "disconnected",
      leadsAdded: page.leadsAdded,
      leadsMerged: page.leadsMerged,
      leadsDuplicate: page.leadsDuplicate,
    },
  });
  await publishEvent(tx, { type: "meta.page-changed", payload: { pageId: page.id } });
}
