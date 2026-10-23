// The catch-up (M16, M17): every half hour a Page's brought-in forms are read from their cursors, so a webhook we missed
// (ours down for a deploy, Meta's retry window over) never loses a lead. It reads outside any transaction and saves in
// small ones, one lead each; a lead that fails to save stops its form there, leaving the cursor behind it, and is read
// again next time. A rate limit (code 80005) and our own budget are "back off until the next tick", not failures.
import {
  catchupIntervalSeconds,
  enterFormNeedsAttention,
  enterNeedsReconnect,
  callGraph,
  catchupOverlapSeconds,
  lacksPermission,
  livePageByMetaId,
  metaServices,
  needsReconnect,
  openPageToken,
  pendingRetryMinutes,
  stalePending,
  storedMatches,
  toFormRow,
  type MetaFormRow,
  type MetaPageRow,
} from "../../meta-leads/index.js";
import { agencyFactsOf, mayBringIn } from "./agency-facts.js";
import { readFormLeads } from "./catch-up-form.js";
import { noticeMetaOwners, SUMMARY_ABOVE } from "./catch-up-notices.js";
import type { MetaProcessDependencies } from "./process-change.js";
import { saveFetchedLead } from "./save-fetched-lead.js";

export interface CatchUpResult {
  /** Whether the Page still needs its route; false removes it. */
  keepRoute: boolean;
  nextInSeconds: number;
  added: number;
  merged: number;
}

/** The normal pace gets a little random spread, so Pages never all read at once. */
const spread = (seconds: number) => Math.floor(seconds * (1 + Math.random() / 3));
/** At most this many leads are saved in one catch-up; the rest wait for the next tick. */
const MAX_PER_CATCHUP = 500;
const FAILURES_BEFORE_ATTENTION = 3;

const idle = (keepRoute: boolean): CatchUpResult => ({
  keepRoute,
  nextInSeconds: spread(catchupIntervalSeconds),
  added: 0,
  merged: 0,
});

/** Reads and saves what a Page's brought-in forms gained since their cursors. */
export async function catchUpPage(
  dependencies: MetaProcessDependencies,
  organizationId: string,
  metaPageId: string,
  now: Date,
): Promise<CatchUpResult> {
  const { db } = dependencies;
  const services = metaServices(dependencies);
  const found = await db.forOrg(organizationId, async (tx) => {
    const page = await livePageByMetaId(tx, metaPageId);
    if (page === null) return null;
    const forms = (
      await tx.metaForm.findMany({ where: { metaPageId: page.id, state: { in: ["running", "needs_attention"] } } })
    ).map(toFormRow);
    return { page, forms };
  });
  if (found === null) return idle(false);
  const { page, forms } = found;
  // A paused Page, or one waiting for a reconnect, keeps its route and reads nothing; a closed agency waits (8.5).
  if (page.status !== "running" || services === null || !(await mayBringIn(dependencies, organizationId)))
    return idle(true);
  const token = openPageToken(services.secretBox, page);
  if (token === null) {
    await db.forOrg(organizationId, (tx) => enterNeedsReconnect(tx, page, now));
    return idle(true);
  }
  const agency = await agencyFactsOf(dependencies, organizationId);
  if (agency === null) return idle(true);

  const outcome = { added: 0, merged: 0, stopped: false, failure: false };
  const madeFor = new Map<string, number>();
  const budget = { left: MAX_PER_CATCHUP };
  for (const form of forms) {
    if (outcome.stopped || budget.left <= 0) break;
    await catchUpForm(dependencies, { page, form, token, agency, now, outcome, madeFor, budget });
  }
  if (!outcome.stopped) await retryPending(dependencies, { page, agency, token, now, outcome, madeFor });
  await noticeMetaOwners(db, page, madeFor, now);
  await recordCheck(dependencies, page, now, outcome);
  return {
    keepRoute: true,
    nextInSeconds: spread(catchupIntervalSeconds),
    added: outcome.added,
    merged: outcome.merged,
  };
}

interface FormRun {
  page: MetaPageRow;
  form: MetaFormRow;
  token: string;
  agency: NonNullable<Awaited<ReturnType<typeof agencyFactsOf>>>;
  now: Date;
  outcome: { added: number; merged: number; stopped: boolean; failure: boolean };
  madeFor: Map<string, number>;
  budget: { left: number };
}

async function catchUpForm(dependencies: MetaProcessDependencies, run: FormRun): Promise<void> {
  const { page, form, token, agency, now, outcome, madeFor, budget } = run;
  const services = metaServices(dependencies);
  if (services === null) return;
  const read = await readFormLeads(
    dependencies,
    services.graph,
    page,
    form,
    token,
    Math.max(0, Number(form.catchupCursor ?? 0n) - catchupOverlapSeconds),
  );
  if (!read.ok) {
    const { failure } = read;
    if (needsReconnect(failure) || lacksPermission(failure)) {
      // A token that fails, or a permission that was taken back, ends the Page's reading until it is connected again (M3).
      await dependencies.db.forOrg(page.organizationId, (tx) => enterNeedsReconnect(tx, page, now));
      outcome.stopped = true;
    } else if (failure.reason === "not_found") {
      // The form is gone at Meta: it needs a look, and its other leads are unaffected.
      await dependencies.db.forOrg(page.organizationId, (tx) => enterFormNeedsAttention(tx, { page, form, now }));
    } else if (failure.reason === "rate_limited" || failure.reason === "budget") {
      outcome.stopped = true;
    } else {
      outcome.stopped = true;
      outcome.failure = true;
    }
    return;
  }
  const matches = await dependencies.db.forOrg(page.organizationId, (tx) => storedMatches(tx, form.id));
  const fresh = read.leads.filter((lead) => !read.settled.has(lead.id));
  const kinder = fresh.length > SUMMARY_ABOVE ? ("none" as const) : ("each" as const);
  let handledTo = form.catchupCursor ?? 0n;
  for (const lead of read.leads) {
    if (read.settled.has(lead.id)) {
      handledTo = bigger(handledTo, lead.createdAt);
      continue;
    }
    if (budget.left <= 0) {
      break;
    }
    try {
      const saved = await saveFetchedLead(dependencies.db, { page, form, matches, agency, notify: kinder }, lead, now);
      budget.left -= 1;
      if (saved.kind === "saved") {
        outcome[saved.status] += 1;
        const owner = saved.ownerUserId ?? agency.ownerUserId;
        madeFor.set(owner, (madeFor.get(owner) ?? 0) + 1);
      }
      handledTo = bigger(handledTo, lead.createdAt);
    } catch (error) {
      // The lead stays pending; the form stops here and the cursor stays behind it, so it is read again (M16).
      dependencies.logger.warn(
        { pageRowId: page.id, name: error instanceof Error ? error.name : "unknown" },
        "A Meta lead could not be saved",
      );
      outcome.stopped = true;
      outcome.failure = true;
      break;
    }
  }
  if (handledTo !== (form.catchupCursor ?? 0n)) {
    await dependencies.db.forOrg(page.organizationId, (tx) =>
      tx.metaForm.update({ where: { id: form.id }, data: { catchupCursor: handledTo } }),
    );
  }
}

const bigger = (cursor: bigint, at: Date): bigint => {
  const seconds = BigInt(Math.floor(at.getTime() / 1000));
  return seconds > cursor ? seconds : cursor;
};

/** Rows left pending past five minutes (a crash between the read and the save) are fetched and saved again (M7). */
async function retryPending(
  dependencies: MetaProcessDependencies,
  run: Pick<FormRun, "page" | "agency" | "token" | "now" | "outcome" | "madeFor">,
): Promise<void> {
  const { page, agency, token, now, outcome, madeFor } = run;
  const services = metaServices(dependencies);
  if (services === null) return;
  const older = new Date(now.getTime() - pendingRetryMinutes * 60_000);
  const rows = await dependencies.db.forOrg(page.organizationId, async (tx) => {
    const pending = await stalePending(tx, older, 50);
    const formIds = await tx.metaForm.findMany({ where: { metaPageId: page.id }, select: { formId: true } });
    return pending.filter((row) => formIds.some((form) => form.formId === row.formId));
  });
  for (const row of rows) {
    const fetched = await callGraph(dependencies, page.organizationId, "catchup", () =>
      services.graph.getLead(row.metaLeadId, token),
    );
    if (!fetched.ok) {
      if (fetched.failure.reason === "budget" || fetched.failure.reason === "rate_limited") return;
      continue;
    }
    const { form, matches } = await dependencies.db.forOrg(page.organizationId, async (tx) => {
      const stored = await tx.metaForm.findFirst({ where: { formId: row.formId, metaPageId: page.id } });
      return stored === null
        ? { form: null, matches: [] }
        : { form: toFormRow(stored), matches: await storedMatches(tx, stored.id) };
    });
    if (form === null) continue;
    const saved = await saveFetchedLead(
      dependencies.db,
      { page, form, matches, agency, notify: "each" },
      fetched.value,
      now,
    );
    if (saved.kind === "saved") {
      outcome[saved.status] += 1;
      const owner = saved.ownerUserId ?? agency.ownerUserId;
      madeFor.set(owner, (madeFor.get(owner) ?? 0) + 1);
    }
  }
}

/** The Page's check is recorded: failures counted, and three in a row make it amber; a clean one clears them. */
async function recordCheck(
  dependencies: MetaProcessDependencies,
  page: MetaPageRow,
  now: Date,
  outcome: { stopped: boolean; failure: boolean },
): Promise<void> {
  await dependencies.db.forOrg(page.organizationId, async (tx) => {
    const current = await tx.metaPage.findUnique({
      where: { id: page.id },
      select: { status: true, consecutiveFailures: true, attentionSince: true },
    });
    // A Pause or a reconnect notice that came while the catch-up read is never undone by it.
    if (current?.status !== "running") return;
    if (outcome.failure) {
      const failures = current.consecutiveFailures + 1;
      await tx.metaPage.update({
        where: { id: page.id },
        data: {
          lastCheckedAt: now,
          consecutiveFailures: failures,
          ...(failures >= FAILURES_BEFORE_ATTENTION && current.attentionSince === null ? { attentionSince: now } : {}),
        },
      });
      return;
    }
    await tx.metaPage.update({
      where: { id: page.id },
      data: {
        lastCheckedAt: now,
        ...(outcome.stopped ? {} : { lastOkAt: now, consecutiveFailures: 0, attentionSince: null }),
      },
    });
  });
}
