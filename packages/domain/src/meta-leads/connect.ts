// Connecting Pages (spec 3.2, 4.1): the login's address, the exchange of Facebook's code for the Pages the person shared,
// and the confirmation that subscribes the ticked ones. The person's login token is used once to list the Pages and is
// then dropped (D2); a Page chosen but not yet confirmed is kept as a `connecting` row with its sealed token (no new table,
// and no ciphertext ever returned to the browser), finished by connectPages or let go by the sweep.
import type {
  MetaConnectedPages,
  MetaConnectFinished,
  MetaConnectStarted,
  MetaPageAvailability,
} from "@travel-crm/contracts/meta-leads";
import { MAX_META_PAGES } from "@travel-crm/contracts/meta-leads";
import { isUniqueViolation, type OrgTx } from "@travel-crm/db";
import { META_GRAPH_VERSION, type MetaPageGrant } from "@travel-crm/integrations/meta-graph";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { publishEvent } from "../jobs/index.js";
import { newUuidV7 } from "../kernel/index.js";
import { isOnDemoPlan } from "../subscriptions/index.js";
import { consumeNonce, makeConnectState, readConnectState } from "./connect-state.js";
import { metaServices, type MetaDependencies } from "./dependencies.js";
import { callGraph, lacksPermission, needsReconnect } from "./graph-calls.js";
import { catchupIntervalSeconds, connectStateMinutes, maxMetaPagesPerOrganization } from "./limits.js";
import { livePageByMetaId, pageNotFound, pageOf } from "./page-row.js";
import * as refuse from "./refusals.js";
import { isHeldElsewhere, removeRoute, upsertRoute } from "./routes.js";
import { clearedToken, openPageToken, sealPageToken } from "./tokens.js";

/** The most drafts one login makes (the input caps the ticks at 20). */
const MAX_DRAFTS = 20;

function configured(dependencies: MetaDependencies) {
  const services = metaServices(dependencies);
  const { login } = dependencies;
  if (services === null || login === null) throw refuse.notConfigured();
  return { ...services, login };
}

/** Facebook Login for Business: the dialog for our saved configuration, passed as config_id, answering with a code. */
export function authorizeUrlOf(
  login: { appId: string; loginConfigId: string; redirectUri: string },
  state: string,
): string {
  const url = new URL(`https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", login.appId);
  url.searchParams.set("redirect_uri", login.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("config_id", login.loginConfigId);
  url.searchParams.set("response_type", "code");
  // SPIKE: Login for Business needs the code response type forced; confirm against the real dialog.
  url.searchParams.set("override_default_response_type", "true");
  return url.toString();
}

/** Step 1: where to send the browser. Nothing is stored. */
export async function startConnect(
  dependencies: MetaDependencies,
  access: MemberAccess,
  input: { reconnectPageId?: string | undefined },
  now: Date,
): Promise<MetaConnectStarted> {
  const { login } = configured(dependencies);
  const { db } = dependencies;
  await db.forOrg(access.organizationId, async (tx) => {
    if (await isOnDemoPlan(tx, access.organizationId)) throw refuse.notInDemo();
    if (input.reconnectPageId !== undefined) {
      const page = await pageOf(tx, input.reconnectPageId);
      if (page === null || page.status === "disconnected" || page.status === "connecting") throw pageNotFound();
    }
  });
  const expiresAt = new Date(now.getTime() + connectStateMinutes * 60_000);
  const state = makeConnectState(login.appSecret, {
    organizationId: access.organizationId,
    userId: access.userId,
    reconnectPageRowId: input.reconnectPageId ?? null,
    expiresAt,
  });
  return { authorizeUrl: authorizeUrlOf(login, state), expiresAt: expiresAt.toISOString() };
}

/** Whether the person may connect this grant here (spec 3.2). */
async function availabilityOf(
  dependencies: MetaDependencies,
  organizationId: string,
  grant: MetaPageGrant,
  reconnecting: string | null,
): Promise<MetaPageAvailability> {
  if (!grant.canAdvertise) return "not_allowed";
  const here = await dependencies.db.forOrg(organizationId, (tx) => livePageByMetaId(tx, grant.id));
  if (here !== null && here.status !== "connecting" && here.id !== reconnecting) return "connected_here";
  if (await isHeldElsewhere(dependencies.db, organizationId, grant.id)) return "connected_elsewhere";
  return "available";
}

/** The draft for a Page the person may connect: made, or updated with the new token (sealed) and person. */
async function keepDraft(
  tx: OrgTx,
  dependencies: MetaDependencies,
  input: { access: MemberAccess; grant: MetaPageGrant; metaUserId: string; now: Date },
): Promise<void> {
  const { secretBox } = metaServices(dependencies) ?? { secretBox: null };
  if (secretBox === null) throw refuse.notConfigured();
  const { access, grant, metaUserId, now } = input;
  const existing =
    (await tx.metaPage.findFirst({ where: { pageId: grant.id, status: "connecting" } })) ??
    // A disconnected Page is connected again on its own row, so its forms, matches and ledger resume (4.6).
    (await tx.metaPage.findFirst({ where: { pageId: grant.id, status: "disconnected" }, orderBy: { id: "desc" } }));
  const id = existing?.id ?? newUuidV7();
  const token = sealPageToken(secretBox, grant.token, access.organizationId, id);
  const data = {
    pageName: grant.name.slice(0, 200),
    status: "connecting",
    ...token,
    tokenKind: "user_long_lived" as const,
    metaUserId,
    connectedBy: access.userId,
    impersonatedBy: access.impersonatedBy,
    createdAt: now,
    disconnectedAt: null,
    attentionSince: null,
    consecutiveFailures: 0,
  };
  if (existing === null) await tx.metaPage.create({ data: { id, pageId: grant.id, ...data } });
  else await tx.metaPage.update({ where: { id }, data });
}

/** Step 2: Facebook's code becomes the list of Pages the person shared, each with what can be done with it. */
export async function finishConnect(
  dependencies: MetaDependencies,
  access: MemberAccess,
  input: { code: string; state: string },
  now: Date,
): Promise<MetaConnectFinished> {
  const { graph, login } = configured(dependencies);
  const state = readConnectState(login.appSecret, input.state, now);
  const theirs = state?.organizationId === access.organizationId && state.userId === access.userId;
  if (state === null || !theirs || !(await consumeNonce(dependencies.limiter, state.nonce, now))) {
    throw refuse.loginFailed();
  }
  const { organizationId } = access;
  const exchanged = await callGraph(dependencies, organizationId, "interactive", () =>
    graph.exchangeLoginCode(input.code, login.redirectUri),
  );
  if (!exchanged.ok) {
    // A code Meta does not accept is a login that failed; only Meta or the network being down is "not answering".
    const down = ["unavailable", "rate_limited", "budget"].includes(exchanged.failure.reason);
    throw down ? refuse.unavailable() : refuse.loginFailed();
  }
  const { userId: metaUserId, userToken } = exchanged.value;
  const listed = await callGraph(dependencies, organizationId, "interactive", () => graph.listPages(userToken));
  if (!listed.ok) {
    throw lacksPermission(listed.failure)
      ? refuse.permissionMissing()
      : needsReconnect(listed.failure)
        ? refuse.loginFailed()
        : refuse.unavailable();
  }
  if (listed.value.length === 0) throw refuse.permissionMissing();

  const pages: MetaConnectFinished["pages"] = [];
  const draftable: MetaPageGrant[] = [];
  for (const grant of listed.value) {
    const availability = await availabilityOf(dependencies, organizationId, grant, state.reconnectPageRowId);
    pages.push({ pageId: grant.id, name: grant.name.slice(0, 200), availability });
    if (availability === "available" || state.reconnectPageRowId !== null) draftable.push(grant);
  }
  if (state.reconnectPageRowId !== null) {
    await reconnectPage(dependencies, access, state.reconnectPageRowId, draftable, metaUserId, now);
    return { pages, reconnectPageRowId: state.reconnectPageRowId };
  }
  // At most as many drafts as can be ticked at once: a login that shares a thousand Pages seals a thousand tokens for nothing.
  const kept = draftable.slice(0, MAX_DRAFTS);
  await dependencies.db.forOrg(organizationId, async (tx) => {
    for (const grant of kept) await keepDraft(tx, dependencies, { access, grant, metaUserId, now });
  });
  // A draft holds a sealed token and the user's id, so Meta's deletion callback must find it: it has a route like a Page.
  for (const grant of kept) {
    await upsertRoute(dependencies.db, {
      metaPageId: grant.id,
      organizationId,
      metaUserId,
      nextCatchupAt: new Date(now.getTime() + catchupIntervalSeconds * 1000),
    });
  }
  return { pages, reconnectPageRowId: null };
}

/** Reconnect (M3): the same Page, a new token; subscribed again, running, and its catch-up due at once. */
async function reconnectPage(
  dependencies: MetaDependencies,
  access: MemberAccess,
  pageRowId: string,
  grants: readonly MetaPageGrant[],
  metaUserId: string,
  now: Date,
): Promise<void> {
  const { graph, secretBox } = configured(dependencies);
  const { organizationId } = access;
  const page = await dependencies.db.forOrg(organizationId, (tx) => pageOf(tx, pageRowId));
  if (page === null || page.status === "disconnected" || page.status === "connecting") throw pageNotFound();
  const grant = grants.find((candidate) => candidate.id === page.pageId);
  if (!grant?.canAdvertise) throw refuse.pageNotAllowed();
  const subscribed = await callGraph(dependencies, organizationId, "interactive", () =>
    graph.subscribePage(grant.id, grant.token),
  );
  if (!subscribed.ok) {
    throw lacksPermission(subscribed.failure) ? refuse.permissionMissing() : refuse.unavailable();
  }
  const sealed = sealPageToken(secretBox, grant.token, organizationId, page.id);
  await dependencies.db.forOrg(organizationId, async (tx) => {
    await tx.metaPage.update({
      where: { id: page.id },
      data: {
        ...sealed,
        tokenKind: "user_long_lived",
        tokenExpiresAt: null,
        metaUserId,
        status: "running",
        subscribedAt: now,
        attentionSince: null,
        consecutiveFailures: 0,
        pageName: grant.name.slice(0, 200),
      },
    });
    await recordAudit(tx, access, {
      action: "meta.page-reconnected",
      entityType: "meta_page",
      entityId: page.id,
      before: { status: page.status },
      after: { status: "running" },
    });
    await publishEvent(tx, { type: "meta.page-changed", payload: { pageId: page.id } });
    await publishEvent(tx, { type: "meta.check-requested", payload: { pageId: page.id } });
  });
}

/** Step 3: subscribes the ticked Pages and keeps them. The rest of the person's drafts are let go. */
export async function connectPages(
  dependencies: MetaDependencies,
  access: MemberAccess,
  metaPageIds: readonly string[],
  now: Date,
): Promise<MetaConnectedPages> {
  const { graph, secretBox } = configured(dependencies);
  const { db } = dependencies;
  const { organizationId } = access;
  const result: MetaConnectedPages = { connected: [], refused: [] };

  const drafts = await db.forOrg(organizationId, (tx) =>
    tx.metaPage.findMany({ where: { status: "connecting", connectedBy: access.userId }, orderBy: { id: "asc" } }),
  );
  const chosen = drafts.filter((draft) => metaPageIds.includes(draft.pageId));
  for (const asked of metaPageIds) {
    if (!chosen.some((draft) => draft.pageId === asked))
      result.refused.push({ pageId: asked, reason: "META_PAGE_NOT_ALLOWED" });
  }
  for (const draft of chosen) {
    const token = openPageToken(secretBox, { ...draft, tokenKeyVersion: draft.tokenKeyVersion });
    if (token === null) {
      result.refused.push({ pageId: draft.pageId, reason: "META_LOGIN_FAILED" });
      continue;
    }
    if (await isHeldElsewhere(db, organizationId, draft.pageId)) {
      result.refused.push({ pageId: draft.pageId, reason: "META_PAGE_TAKEN" });
      continue;
    }
    // The place is taken in a transaction that counts and flips under the agency's lock, held until the flip commits, so two
    // people connecting at once cannot both take the last place (review: the cap race).
    const claimed = await claimPlace(dependencies, draft.id, organizationId, now);
    if (claimed === "limit") {
      result.refused.push({ pageId: draft.pageId, reason: "META_PAGE_LIMIT" });
      continue;
    }
    if (claimed === "taken") {
      result.refused.push({ pageId: draft.pageId, reason: "META_PAGE_TAKEN" });
      continue;
    }
    const subscribed = await callGraph(dependencies, organizationId, "interactive", () =>
      graph.subscribePage(draft.pageId, token),
    );
    if (!subscribed.ok) {
      await giveUpPlace(dependencies, draft.id, organizationId);
      result.refused.push({
        pageId: draft.pageId,
        reason: lacksPermission(subscribed.failure) ? "META_PERMISSION_MISSING" : "META_UNAVAILABLE",
      });
      continue;
    }
    await dependencies.db.forOrg(organizationId, async (tx) => {
      await recordAudit(tx, access, {
        action: "meta.page-connected",
        entityType: "meta_page",
        entityId: draft.id,
        after: { status: "running" },
      });
      await publishEvent(tx, { type: "meta.page-changed", payload: { pageId: draft.id } });
    });
    result.connected.push({ id: draft.id, pageId: draft.pageId });
  }
  await letDraftsGo(
    dependencies,
    access,
    chosen.map((draft) => draft.id),
    now,
  );
  return result;
}

/** Counts the live Pages and, if there is room, makes this draft one, in one transaction under the agency's lock. */
async function claimPlace(
  dependencies: MetaDependencies,
  draftId: string,
  organizationId: string,
  now: Date,
): Promise<"claimed" | "limit" | "taken"> {
  try {
    return await dependencies.db.forOrg(organizationId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`meta-limit:${organizationId}`}, 0))`;
      const live = await tx.metaPage.count({ where: { status: { in: ["running", "paused", "needs_reconnect"] } } });
      if (live >= Math.min(maxMetaPagesPerOrganization, MAX_META_PAGES)) return "limit" as const;
      await tx.metaPage.update({
        where: { id: draftId },
        data: { status: "running", subscribedAt: now, createdAt: now, lastOkAt: now },
      });
      return "claimed" as const;
    });
  } catch (error) {
    if (isUniqueViolation(error)) return "taken";
    throw error;
  }
}

/** Meta would not subscribe the Page: the place goes back and the draft is a draft again. */
async function giveUpPlace(dependencies: MetaDependencies, draftId: string, organizationId: string): Promise<void> {
  await dependencies.db.forOrg(organizationId, (tx) =>
    tx.metaPage.update({ where: { id: draftId }, data: { status: "connecting", subscribedAt: null, lastOkAt: null } }),
  );
}

/** The person's other drafts (Pages not ticked) go: token deleted, disconnected, their routes dropped. */
async function letDraftsGo(
  dependencies: MetaDependencies,
  access: MemberAccess,
  keepIds: readonly string[],
  now: Date,
): Promise<void> {
  const where = { status: "connecting", connectedBy: access.userId, id: { notIn: [...keepIds] } };
  const gone = await dependencies.db.forOrg(access.organizationId, async (tx) => {
    const drafts = await tx.metaPage.findMany({ where, select: { pageId: true } });
    await tx.metaPage.updateMany({ where, data: { status: "disconnected", disconnectedAt: now, ...clearedToken } });
    return drafts;
  });
  for (const draft of gone) await removeRoute(dependencies.db, access.organizationId, draft.pageId);
}
