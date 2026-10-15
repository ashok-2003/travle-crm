// Claiming a notification's email or push for one delivery run (spec 9.1: listeners run at least once, and runs can
// overlap). A channel is claimed with a lease before it is sent, marked sent only once a send worked, and marked failed
// when it can never succeed, so repeated and overlapping runs send once and give up once.
import type { OrgTx } from "@travel-crm/db";
import { ownMessage } from "@travel-crm/integrations/jobs";
import type { ListenerContext } from "../jobs/index.js";

/**
 * How long a claim holds a channel. The email and push run side by side, and each is bounded: a push at 10 seconds,
 * an SMTP send at 60 (an overall deadline that destroys the connection, so nothing is delivered after it), plus a few
 * database round trips. A live run is therefore done within about a minute and a half, far inside 5 minutes; a claim
 * older than that belongs to a run that crashed, and a retry takes it over. The jobs' retry window reaches at least
 * 310 seconds, so that takeover lands inside the retries with margin, not after the last one.
 */
export const LEASE_MS = 5 * 60_000;

type Where = NonNullable<Parameters<OrgTx["notification"]["updateMany"]>[0]>["where"];
type Data = Parameters<OrgTx["notification"]["updateMany"]>[0]["data"];

/** A channel's three columns, as typed queries: when it was claimed, sent and given up on. */
export interface Channel {
  readonly name: "email" | "push";
  /** Neither sent nor failed, and unclaimed or claimed longer ago than the lease. */
  claimable(now: Date): Where;
  claimedAt(at: Date): Data & Where;
  unclaim(): Data;
  sent(at: Date): Data;
  failed(at: Date): Data;
  /** True when the row is finished with: sent, or given up on. */
  isFinished(row: {
    emailedAt: Date | null;
    emailFailedAt: Date | null;
    pushedAt: Date | null;
    pushFailedAt: Date | null;
  }): boolean;
}

const expired = (now: Date) => new Date(now.getTime() - LEASE_MS);

export const email: Channel = {
  name: "email",
  claimable: (now) => ({
    emailedAt: null,
    emailFailedAt: null,
    OR: [{ emailClaimedAt: null }, { emailClaimedAt: { lt: expired(now) } }],
  }),
  claimedAt: (at) => ({ emailClaimedAt: at }),
  unclaim: () => ({ emailClaimedAt: null }),
  sent: (at) => ({ emailedAt: at }),
  failed: (at) => ({ emailFailedAt: at, emailClaimedAt: null }),
  isFinished: (row) => row.emailedAt !== null || row.emailFailedAt !== null,
};

export const push: Channel = {
  name: "push",
  claimable: (now) => ({
    pushedAt: null,
    pushFailedAt: null,
    OR: [{ pushClaimedAt: null }, { pushClaimedAt: { lt: expired(now) } }],
  }),
  claimedAt: (at) => ({ pushClaimedAt: at }),
  unclaim: () => ({ pushClaimedAt: null }),
  sent: (at) => ({ pushedAt: at }),
  failed: (at) => ({ pushFailedAt: at, pushClaimedAt: null }),
  isFinished: (row) => row.pushedAt !== null || row.pushFailedAt !== null,
};

/**
 * Takes the channel for this run, in its own committed transaction: only the run that finds it unfinished and
 * unclaimed (or claimed longer ago than the lease) wins. Returns the claim's time, or null when another run holds it.
 */
export async function claim(context: ListenerContext, id: string, channel: Channel): Promise<Date | null> {
  const claimedAt = new Date();
  const taken = await context.forOrg((tx) =>
    tx.notification.updateMany({ where: { id, ...channel.claimable(claimedAt) }, data: channel.claimedAt(claimedAt) }),
  );
  return taken.count > 0 ? claimedAt : null;
}

/**
 * Gives a claim back after a failed send, but only if it is still this run's. A failure to do so is reported (ids
 * only) and not raised: the send's own error is the one worth raising, and the lease expires on its own.
 */
export async function release(
  context: ListenerContext,
  id: string,
  channel: Channel,
  claimedAt: Date,
  log: (message: string) => void,
): Promise<void> {
  try {
    await context.forOrg((tx) =>
      tx.notification.updateMany({ where: { id, ...channel.claimedAt(claimedAt) }, data: channel.unclaim() }),
    );
  } catch {
    log(
      `Notification ${id}: the ${channel.name} claim could not be released; it expires in ${String(LEASE_MS / 60_000)} minutes`,
    );
  }
}

export async function markSent(context: ListenerContext, id: string, channel: Channel): Promise<void> {
  await context.forOrg((tx) => tx.notification.updateMany({ where: { id }, data: channel.sent(new Date()) }));
}

/** Gives the channel up for good, and drops the claim. */
export async function markFailed(context: ListenerContext, id: string, channel: Channel): Promise<void> {
  await context.forOrg((tx) => tx.notification.updateMany({ where: { id }, data: channel.failed(new Date()) }));
}

/**
 * This run lost the claim. If the other run has finished (sent, or given up) there is nothing to do; otherwise it is
 * still sending, or died: ask to be retried, by when its result is recorded or its lease has expired.
 */
export async function checkOtherRun(context: ListenerContext, id: string, channel: Channel): Promise<void> {
  const row = await context.forOrg((tx) => tx.notification.findUnique({ where: { id } }));
  if (row !== null && channel.isFinished(row)) return;
  throw ownMessage(new Error(`Notification ${id}: the ${channel.name} is being delivered by another run`));
}
