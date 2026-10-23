// The daily check of a Page (M3, M16, spec 3.4): the token still works and when it ends (warning the Owner seven days
// before), our app is still subscribed, the names and Meta's status of the forms are current, and a brought-in form's
// questions are the ones that were matched (else it needs attention). Reads Meta outside any transaction.
import type { OrgTx } from "@travel-crm/db";
import { metaServices, type MetaDependencies } from "./dependencies.js";
import { enterFormNeedsAttention, enterNeedsReconnect } from "./attention.js";
import { describeForm, questionsHashOf, refreshForms, toFormRow } from "./forms.js";
import { callGraph, needsReconnect } from "./graph-calls.js";
import { tokenWarningDays } from "./limits.js";
import { publishEvent } from "../jobs/index.js";
import { pageOf, type MetaPageRow } from "./page-row.js";
import { openPageToken } from "./tokens.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const sameBytes = (a: Uint8Array | null, b: Uint8Array) => a !== null && Buffer.from(a).equals(Buffer.from(b));

export type HealthOutcome = "ok" | "needs_reconnect" | "skipped";

/** Checks one running Page. A Page that is not running (paused, needing a reconnect) is left as it is. */
export async function checkPageHealth(
  dependencies: MetaDependencies,
  pageRowId: string,
  organizationId: string,
  now: Date,
): Promise<HealthOutcome> {
  const services = metaServices(dependencies);
  if (services === null) return "skipped";
  const { db } = dependencies;
  const page = await db.forOrg(organizationId, (tx) => pageOf(tx, pageRowId));
  if (page?.status !== "running") return "skipped";
  const token = openPageToken(services.secretBox, page);
  const reconnect = async () => {
    await db.forOrg(organizationId, (tx) => enterNeedsReconnect(tx, page, now));
    return "needs_reconnect" as const;
  };
  if (token === null) return reconnect();

  const inspected = await callGraph(dependencies, organizationId, "catchup", () => services.graph.inspectToken(token));
  if (inspected.ok && !inspected.value.valid) return reconnect();
  if (!inspected.ok && needsReconnect(inspected.failure)) return reconnect();
  if (inspected.ok) await recordExpiry(dependencies, page, inspected.value.expiresAt, now);

  const subscribed = await callGraph(dependencies, organizationId, "catchup", () =>
    services.graph.pageIsSubscribed(page.pageId, token),
  );
  if (subscribed.ok && !subscribed.value) {
    await callGraph(dependencies, organizationId, "catchup", () => services.graph.subscribePage(page.pageId, token));
  } else if (!subscribed.ok && needsReconnect(subscribed.failure)) {
    return reconnect();
  }
  try {
    await refreshForms(dependencies, page, now, { force: true });
  } catch {
    // Meta did not answer the forms: the names are kept as they were, and tomorrow's check tries again.
    return "ok";
  }
  await compareQuestions(dependencies, page, now);
  return "ok";
}

/** Keeps the token's expiry, and warns once when it first falls within the warning days. */
async function recordExpiry(
  dependencies: MetaDependencies,
  page: MetaPageRow,
  expiresAt: Date | null,
  now: Date,
): Promise<void> {
  const nearAt = now.getTime() + tokenWarningDays * DAY_MS;
  const wasNear = page.tokenExpiresAt !== null && page.tokenExpiresAt.getTime() <= nearAt;
  const isNear = expiresAt !== null && expiresAt.getTime() <= nearAt;
  if (expiresAt?.getTime() === page.tokenExpiresAt?.getTime() && !isNear) return;
  await dependencies.db.forOrg(page.organizationId, async (tx: OrgTx) => {
    await tx.metaPage.update({ where: { id: page.id }, data: { tokenExpiresAt: expiresAt } });
    if (isNear && !wasNear) {
      await publishEvent(tx, { type: "meta.attention", payload: { pageId: page.id, kind: "token_expiring" } });
    }
  });
}

/** A brought-in form whose questions changed at Meta needs a look; its leads still reach the note meanwhile. */
async function compareQuestions(dependencies: MetaDependencies, page: MetaPageRow, now: Date): Promise<void> {
  const forms = await dependencies.db.forOrg(page.organizationId, async (tx) =>
    (await tx.metaForm.findMany({ where: { metaPageId: page.id, state: "running" } })).map(toFormRow),
  );
  for (const form of forms) {
    let described;
    try {
      described = await describeForm(dependencies, page, form);
    } catch {
      continue;
    }
    if (sameBytes(form.questionsHash, questionsHashOf(described.questions))) continue;
    await dependencies.db.forOrg(page.organizationId, async (tx) => {
      const fresh = await tx.metaForm.findUnique({ where: { id: form.id } });
      if (fresh !== null) await enterFormNeedsAttention(tx, { page, form: toFormRow(fresh), now });
    });
  }
}
